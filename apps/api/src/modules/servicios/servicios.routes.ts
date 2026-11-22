import { Router } from "express";
import { ServicioActualizarSchema, ServicioCrearSchema } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
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
    res.status(201).json({ servicio });
  }),
);

serviciosRouter.patch(
  "/:id",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const id = String(req.params.id);
    const parsed = ServicioActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    await validarCategoria(parsed.data.categoriaId);
    const { count } = await prisma.servicio.updateMany({ where: { id, eliminadoEn: null }, data: parsed.data });
    if (count === 0) throw new HttpError(404, "no_encontrado", "Servicio no encontrado");
    res.json({ servicio: await prisma.servicio.findUnique({ where: { id } }) });
  }),
);

/** Borrado lógico: solo ADMIN. */
serviciosRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    sesionDe(res);
    const { count } = await prisma.servicio.updateMany({
      where: { id: String(req.params.id), eliminadoEn: null },
      data: { eliminadoEn: new Date() },
    });
    if (count === 0) throw new HttpError(404, "no_encontrado", "Servicio no encontrado");
    res.status(204).end();
  }),
);
