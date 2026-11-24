import { Router } from "express";
import { ServicioActualizarSchema, ServicioCrearSchema } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { CAMPOS_CLAVE, diferencias, registrarActividad } from "../../lib/bitacora.js";
import { prisma } from "../../lib/db.js";
import { HttpError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

export const serviciosRouter = Router();

// Lectura: cualquier rol. Alta y edición: ADMIN y DIRECCION (autoriza servicios). Eliminar: solo ADMIN.
serviciosRouter.use(requireAuth);

/** Verifica que la categoría exista y no esté eliminada. */
async function validarCategoria(categoriaId: string | null | undefined) {
  if (!categoriaId) return;
  const categoria = await prisma.categoriaServicio.findFirst({ where: { id: categoriaId, eliminadoEn: null } });
  if (!categoria) throw new HttpError(400, "categoria_invalida", "La categoría no existe");
}

serviciosRouter.get(
  "/",
  ruta(async (_req, res) => {
    sesionDe(res);
    const servicios = await prisma.servicio.findMany({
      where: { eliminadoEn: null },
      include: { categoria: { select: { id: true, nombre: true } } },
      orderBy: { nombre: "asc" },
    });
    res.json({ servicios });
  }),
);

serviciosRouter.post(
  "/",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = ServicioCrearSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    await validarCategoria(parsed.data.categoriaId);
    const servicio = await prisma.servicio.create({ data: { ...parsed.data, creadoPorId: usuarioId } });
    await registrarActividad({
      usuarioId,
      accion: "servicio.crear",
      entidad: "servicio",
      entidadId: servicio.id,
      resumen: `Creó el servicio ${servicio.nombre}`,
    });
    res.status(201).json({ servicio });
  }),
);

serviciosRouter.patch(
  "/:id",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const id = String(req.params.id);
    const parsed = ServicioActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    await validarCategoria(parsed.data.categoriaId);
    const antes = await prisma.servicio.findFirst({ where: { id, eliminadoEn: null } });
    if (!antes) throw new HttpError(404, "no_encontrado", "Servicio no encontrado");
    await prisma.servicio.update({ where: { id: antes.id }, data: parsed.data });
    const despues = await prisma.servicio.findUniqueOrThrow({ where: { id } });
    const cambios = diferencias(antes, despues, CAMPOS_CLAVE.servicio);
    if (cambios) {
      await registrarActividad({
        usuarioId,
        accion: "servicio.editar",
        entidad: "servicio",
        entidadId: id,
        resumen: `Editó el servicio ${despues.nombre}`,
        cambios,
      });
    }
    res.json({ servicio: despues });
  }),
);

/** Borrado lógico: solo ADMIN. */
serviciosRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const actual = await prisma.servicio.findFirst({ where: { id: String(req.params.id), eliminadoEn: null } });
    if (!actual) throw new HttpError(404, "no_encontrado", "Servicio no encontrado");
    await prisma.servicio.update({ where: { id: actual.id }, data: { eliminadoEn: new Date() } });
    await registrarActividad({
      usuarioId,
      accion: "servicio.eliminar",
      entidad: "servicio",
      entidadId: actual.id,
      resumen: `Eliminó (lógicamente) el servicio ${actual.nombre}`,
    });
    res.status(204).end();
  }),
);
