import { Router } from "express";
import { CategoriaCrearSchema } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { prisma } from "../../lib/db.js";
import { HttpError, traducirErrorPrisma } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

export const categoriasRouter = Router();

// Lectura: cualquier rol. Alta, edición y eliminación: ADMIN y DIRECCION.
categoriasRouter.use(requireAuth);

categoriasRouter.get(
  "/",
  ruta(async (_req, res) => {
    sesionDe(res);
    const categorias = await prisma.categoriaServicio.findMany({ where: { eliminadoEn: null }, orderBy: { nombre: "asc" } });
    res.json({ categorias });
  }),
);

categoriasRouter.post(
  "/",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = CategoriaCrearSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    try {
      const categoria = await prisma.categoriaServicio.create({ data: { nombre: parsed.data.nombre, creadoPorId: usuarioId } });
      res.status(201).json({ categoria });
    } catch (e) {
      throw traducirErrorPrisma(e);
    }
  }),
);

categoriasRouter.patch(
  "/:id",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const parsed = CategoriaCrearSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    try {
      const { count } = await prisma.categoriaServicio.updateMany({
        where: { id: String(req.params.id), eliminadoEn: null },
        data: { nombre: parsed.data.nombre },
      });
      if (count === 0) throw new HttpError(404, "no_encontrado", "Categoría no encontrada");
      res.json({ categoria: await prisma.categoriaServicio.findUnique({ where: { id: String(req.params.id) } }) });
    } catch (e) {
      throw traducirErrorPrisma(e);
    }
  }),
);

/** Borrado lógico. Los servicios de la categoría quedan sin categoría. */
categoriasRouter.delete(
  "/:id",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const id = String(req.params.id);
    const { count } = await prisma.categoriaServicio.updateMany({
      where: { id, eliminadoEn: null },
      data: { eliminadoEn: new Date() },
    });
    if (count === 0) throw new HttpError(404, "no_encontrado", "Categoría no encontrada");
    await prisma.servicio.updateMany({ where: { categoriaId: id }, data: { categoriaId: null } });
    res.status(204).end();
  }),
);
