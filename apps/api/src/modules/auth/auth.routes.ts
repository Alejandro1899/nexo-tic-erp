import { Router } from "express";
import { z } from "zod";
import { CambiarPasswordSchema } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { prisma } from "../../lib/db.js";
import { HttpError } from "../../lib/errors.js";
import { registrarActividad } from "../../lib/bitacora.js";
import { COOKIE_SESION, DURACION_SESION_SEG, cookieSesion, leerCookie } from "../../lib/http.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { requireAuth } from "../../middleware/auth.js";
import { sesionDe } from "../../middleware/roles.js";
import { crearSesion, revocarSesion } from "./sesiones.js";

// Se entra con correo o con usuario de acceso, en el mismo campo.
const LoginSchema = z
  .object({
    usuario: z.string().trim().min(1).max(200),
    password: z.string().min(1),
  })
  .strict();

const datosUsuario = (u: {
  id: string;
  nombre: string;
  username: string;
  email: string;
  rol: string;
  esSuperAdmin: boolean;
  debeCambiarPassword: boolean;
}) => ({
  id: u.id,
  nombre: u.nombre,
  username: u.username,
  email: u.email,
  rol: u.rol,
  esSuperAdmin: u.esSuperAdmin,
  debeCambiarPassword: u.debeCambiarPassword,
});

const CREDENCIALES_INVALIDAS = new HttpError(401, "credenciales_invalidas", "Usuario, correo o contraseña incorrectos");

export const authRouter = Router();

authRouter.post(
  "/login",
  ruta(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "solicitud_invalida", "Datos de acceso inválidos");
    const identificador = parsed.data.usuario.toLowerCase();

    const usuario = await prisma.usuario.findFirst({
      where: identificador.includes("@") ? { email: identificador } : { username: identificador },
    });
    const valido = usuario && usuario.activo && !usuario.eliminadoEn && (await verifyPassword(parsed.data.password, usuario.passwordHash));
    if (!usuario || !valido) {
      await registrarActividad({
        usuarioId: usuario?.id ?? null,
        accion: "sesion.fallida",
        entidad: "sesion",
        entidadId: usuario?.id ?? null,
        resumen: `Intento de acceso fallido con "${identificador}"`,
      });
      throw CREDENCIALES_INVALIDAS;
    }

    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcceso: new Date() } });
    const token = await crearSesion(usuario);
    await registrarActividad({
      usuarioId: usuario.id,
      accion: "sesion.iniciar",
      entidad: "sesion",
      entidadId: usuario.id,
      resumen: `${usuario.nombre} inició sesión`,
    });
    res.setHeader("Set-Cookie", cookieSesion(token, DURACION_SESION_SEG));
    res.json({ usuario: datosUsuario(usuario) });
  }),
);

authRouter.post(
  "/logout",
  ruta(async (req, res) => {
    const token = leerCookie(req.headers.cookie, COOKIE_SESION);
    if (token) await revocarSesion(token);
    res.setHeader("Set-Cookie", cookieSesion("", 0));
    res.status(204).end();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  ruta(async (_req, res) => {
    const sesion = sesionDe(res);
    const usuario = await prisma.usuario.findUnique({ where: { id: sesion.usuarioId } });
    if (!usuario) throw new HttpError(401, "no_autenticado", "Sesión inválida");
    res.json({ usuario: datosUsuario(usuario) });
  }),
);

/** El propio usuario cambia su contraseña. Cierra sus otras sesiones y deja de estar obligado a cambiarla. */
authRouter.post(
  "/cambiar-password",
  requireAuth,
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = CambiarPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new HttpError(401, "no_autenticado", "Sesión inválida");
    if (!(await verifyPassword(parsed.data.passwordActual, usuario.passwordHash))) {
      throw new HttpError(400, "password_actual_incorrecta", "La contraseña actual no es correcta");
    }
    const actualizado = await prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash: await hashPassword(parsed.data.passwordNueva), debeCambiarPassword: false },
    });
    await prisma.sesion.deleteMany({ where: { usuarioId } });
    const token = await crearSesion(actualizado);
    res.setHeader("Set-Cookie", cookieSesion(token, DURACION_SESION_SEG));
    res.json({ usuario: datosUsuario(actualizado) });
  }),
);
