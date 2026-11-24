/** Gestión de usuarios: solo ADMIN. Protege al super administrador y nunca borra físicamente: usa borrado lógico. */
import { Router } from "express";
import { UsuarioActualizarSchema, UsuarioCrearSchema } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { CAMPOS_CLAVE, diferencias, registrarActividad } from "../../lib/bitacora.js";
import { prisma } from "../../lib/db.js";
import { HttpError, traducirErrorPrisma } from "../../lib/errors.js";
import { generarPasswordTemporal, hashPassword } from "../../lib/password.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

export const usuariosRouter = Router();

// Solo ADMIN gestiona usuarios (ALCANCE 4.11).
usuariosRouter.use(requireAuth, requireRole("ADMIN"));

/** Nunca se devuelve passwordHash. */
const publico = (u: {
  id: string;
  nombre: string;
  username: string;
  email: string;
  rol: string;
  activo: boolean;
  esSuperAdmin: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: Date | null;
  creadoEn: Date;
}) => ({
  id: u.id,
  nombre: u.nombre,
  username: u.username,
  email: u.email,
  rol: u.rol,
  activo: u.activo,
  esSuperAdmin: u.esSuperAdmin,
  debeCambiarPassword: u.debeCambiarPassword,
  ultimoAcceso: u.ultimoAcceso,
  creadoEn: u.creadoEn,
});

/** Busca un usuario no eliminado; si no existe, responde 404. */
async function usuarioVigente(id: string) {
  const usuario = await prisma.usuario.findFirst({ where: { id, eliminadoEn: null } });
  if (!usuario) throw new HttpError(404, "no_encontrado", "Usuario no encontrado");
  return usuario;
}

/** El super administrador solo lo puede modificar él mismo. */
function protegerSuperAdmin(objetivo: { esSuperAdmin: boolean; id: string }, actorId: string) {
  if (objetivo.esSuperAdmin && objetivo.id !== actorId) {
    throw new HttpError(403, "super_admin_protegido", "Solo el super administrador puede modificar su propia cuenta");
  }
}

usuariosRouter.get(
  "/",
  ruta(async (req, res) => {
    sesionDe(res);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const estado = typeof req.query.estado === "string" ? req.query.estado : "";
    const usuarios = await prisma.usuario.findMany({
      where: {
        eliminadoEn: null,
        ...(estado === "activo" ? { activo: true } : estado === "inactivo" ? { activo: false } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { username: { contains: q.toLowerCase() } },
                { email: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });
    res.json({ usuarios: usuarios.map(publico) });
  }),
);

usuariosRouter.get(
  "/:id",
  ruta(async (req, res) => {
    sesionDe(res);
    res.json({ usuario: publico(await usuarioVigente(String(req.params.id))) });
  }),
);

usuariosRouter.post(
  "/",
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = UsuarioCrearSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const { passwordInicial, ...datos } = parsed.data;
    try {
      const usuario = await prisma.usuario.create({
        data: {
          ...datos,
          passwordHash: await hashPassword(passwordInicial),
          debeCambiarPassword: true,
          creadoPorId: usuarioId,
        },
      });
      await registrarActividad({
        usuarioId,
        accion: "usuario.crear",
        entidad: "usuario",
        entidadId: usuario.id,
        resumen: `Creó al usuario ${usuario.nombre} (${usuario.rol})`,
      });
      res.status(201).json({ usuario: publico(usuario) });
    } catch (e) {
      throw traducirErrorPrisma(e);
    }
  }),
);

usuariosRouter.patch(
  "/:id",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const parsed = UsuarioActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const objetivo = await usuarioVigente(String(req.params.id));
    protegerSuperAdmin(objetivo, sesion.usuarioId);
    // Nadie se quita a sí mismo el acceso ni el rol de ADMIN.
    if (objetivo.id === sesion.usuarioId && (parsed.data.activo === false || (parsed.data.rol && parsed.data.rol !== "ADMIN"))) {
      throw new HttpError(400, "accion_no_permitida", "No puedes desactivarte ni quitarte el rol de ADMIN a ti mismo");
    }
    try {
      const usuario = await prisma.usuario.update({ where: { id: objetivo.id }, data: parsed.data });
      if (parsed.data.activo === false) {
        await prisma.sesion.deleteMany({ where: { usuarioId: usuario.id } });
      }
      const cambios = diferencias(objetivo, usuario, CAMPOS_CLAVE.usuario);
      if (cambios) {
        await registrarActividad({
          usuarioId: sesion.usuarioId,
          accion: "usuario.editar",
          entidad: "usuario",
          entidadId: usuario.id,
          resumen: `Editó al usuario ${usuario.nombre}`,
          cambios,
        });
      }
      res.json({ usuario: publico(usuario) });
    } catch (e) {
      throw traducirErrorPrisma(e);
    }
  }),
);

/** Restablece la contraseña: genera una temporal, se muestra una sola vez y obliga a cambiarla al entrar. */
usuariosRouter.post(
  "/:id/restablecer-password",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const objetivo = await usuarioVigente(String(req.params.id));
    protegerSuperAdmin(objetivo, sesion.usuarioId);
    if (objetivo.id === sesion.usuarioId) {
      throw new HttpError(400, "accion_no_permitida", "Para cambiar tu propia contraseña usa la opción de cambiar contraseña");
    }
    const temporal = generarPasswordTemporal();
    await prisma.usuario.update({
      where: { id: objetivo.id },
      data: { passwordHash: await hashPassword(temporal), debeCambiarPassword: true },
    });
    await prisma.sesion.deleteMany({ where: { usuarioId: objetivo.id } });
    await registrarActividad({
      usuarioId: sesion.usuarioId,
      accion: "usuario.restablecer_password",
      entidad: "usuario",
      entidadId: objetivo.id,
      resumen: `Restableció la contraseña de ${objetivo.nombre}`,
    });
    res.json({ passwordTemporal: temporal });
  }),
);

/** Borrado lógico: el usuario deja de poder entrar y se conserva el historial. */
usuariosRouter.delete(
  "/:id",
  ruta(async (req, res) => {
    const sesion = sesionDe(res);
    const objetivo = await usuarioVigente(String(req.params.id));
    protegerSuperAdmin(objetivo, sesion.usuarioId);
    if (objetivo.id === sesion.usuarioId) {
      throw new HttpError(400, "accion_no_permitida", "No puedes eliminar tu propia cuenta");
    }
    await prisma.usuario.update({
      where: { id: objetivo.id },
      data: { eliminadoEn: new Date(), activo: false },
    });
    await prisma.sesion.deleteMany({ where: { usuarioId: objetivo.id } });
    await registrarActividad({
      usuarioId: sesion.usuarioId,
      accion: "usuario.eliminar",
      entidad: "usuario",
      entidadId: objetivo.id,
      resumen: `Eliminó (lógicamente) al usuario ${objetivo.nombre}`,
    });
    res.status(204).end();
  }),
);
