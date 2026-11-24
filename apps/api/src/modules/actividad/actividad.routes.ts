import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { ExportacionBitacoraSchema, FORMATO_BITACORA, PurgarBitacoraSchema, VERSION_BITACORA } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { registrarActividad } from "../../lib/bitacora.js";
import { prisma } from "../../lib/db.js";
import { HttpError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

/**
 * Bitácora (ALCANCE 4.13). Consultar: ADMIN y DIRECCION. Exportar, purgar e importar: solo ADMIN.
 * Solo se agregan registros; la purga es manual, pide confirmación y deja su propio registro.
 */
export const actividadRouter = Router();

actividadRouter.use(requireAuth);

const LIMITE_MAX = 500;

function fechaOpcional(valor: unknown): Date | undefined {
  if (typeof valor !== "string" || !valor) return undefined;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) throw new HttpError(400, "datos_invalidos", "Fecha inválida");
  return fecha;
}

actividadRouter.get(
  "/",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (req, res) => {
    sesionDe(res);
    const usuarioId = typeof req.query.usuarioId === "string" && req.query.usuarioId ? req.query.usuarioId : undefined;
    const entidad = typeof req.query.entidad === "string" && req.query.entidad ? req.query.entidad : undefined;
    const desde = fechaOpcional(req.query.desde);
    const hasta = fechaOpcional(req.query.hasta);
    const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), LIMITE_MAX);
    const registros = await prisma.registroActividad.findMany({
      where: {
        ...(usuarioId ? { usuarioId } : {}),
        ...(entidad ? { entidad } : {}),
        ...(desde || hasta ? { creadoEn: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      },
      orderBy: { creadoEn: "desc" },
      take: limite,
    });
    res.json({ registros });
  }),
);

/** Resumen para el aviso de limpieza: cuántos registros hay y cuánto tiempo pasó desde la última exportación. */
actividadRouter.get(
  "/resumen",
  requireRole("ADMIN", "DIRECCION"),
  ruta(async (_req, res) => {
    sesionDe(res);
    const [total, ultimaExportacion] = await Promise.all([
      prisma.registroActividad.count(),
      prisma.registroActividad.findFirst({ where: { accion: "bitacora.exportar" }, orderBy: { creadoEn: "desc" }, select: { creadoEn: true } }),
    ]);
    const dias = ultimaExportacion ? Math.floor((Date.now() - ultimaExportacion.creadoEn.getTime()) / 86_400_000) : null;
    res.json({
      total,
      ultimaExportacionEn: ultimaExportacion?.creadoEn ?? null,
      diasDesdeExportacion: dias,
      avisarLimpieza: dias === null ? total > 0 : dias >= 21,
    });
  }),
);

/** Exporta todos los registros hasta la fecha indicada, en el formato fijo de la bitácora. Solo ADMIN. */
actividadRouter.get(
  "/exportar",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const hasta = fechaOpcional(req.query.hasta) ?? new Date();
    const filas = await prisma.registroActividad.findMany({ where: { creadoEn: { lte: hasta } }, orderBy: { creadoEn: "asc" } });
    const exportacion = {
      formato: FORMATO_BITACORA,
      version: VERSION_BITACORA,
      exportadoEn: new Date().toISOString(),
      hasta: hasta.toISOString(),
      registros: filas.map((r) => ({
        id: r.id,
        creadoEn: r.creadoEn.toISOString(),
        usuarioId: r.usuarioId,
        usuarioNombre: r.usuarioNombre,
        accion: r.accion,
        entidad: r.entidad,
        entidadId: r.entidadId,
        resumen: r.resumen,
        cambios: r.cambios ?? null,
      })),
    };
    await registrarActividad({
      usuarioId,
      accion: "bitacora.exportar",
      entidad: "bitacora",
      resumen: `Exportó ${filas.length} registros de la bitácora hasta ${hasta.toLocaleDateString("es-MX")}`,
    });
    res.setHeader("Content-Disposition", `attachment; filename="bitacora-${hasta.toISOString().slice(0, 10)}.json"`);
    res.json(exportacion);
  }),
);

/** Purga manual: borra los registros hasta la fecha indicada. Exige escribir BORRAR. Solo ADMIN. */
actividadRouter.post(
  "/purgar",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = PurgarBitacoraSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    const hasta = new Date(parsed.data.hasta);
    if (hasta > new Date()) throw new HttpError(400, "datos_invalidos", "La fecha de corte no puede ser futura");
    const { count } = await prisma.registroActividad.deleteMany({ where: { creadoEn: { lte: hasta } } });
    await registrarActividad({
      usuarioId,
      accion: "bitacora.purgar",
      entidad: "bitacora",
      resumen: `Purgó ${count} registros de la bitácora hasta ${hasta.toLocaleDateString("es-MX")}`,
    });
    res.json({ eliminados: count });
  }),
);

/**
 * Importa un archivo exportado. Respeta el id y la fecha originales; los registros que ya existen se omiten.
 * No borra nada. Solo ADMIN.
 */
actividadRouter.post(
  "/importar",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = ExportacionBitacoraSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "archivo_invalido", parsed.error.issues[0]?.message ?? "El archivo no tiene el formato de la bitácora");
    }
    const registros = parsed.data.registros;
    const { count } = await prisma.registroActividad.createMany({
      data: registros.map((r) => ({
        id: r.id,
        creadoEn: new Date(r.creadoEn),
        usuarioId: r.usuarioId,
        usuarioNombre: r.usuarioNombre,
        accion: r.accion,
        entidad: r.entidad,
        entidadId: r.entidadId,
        resumen: r.resumen,
        cambios: (r.cambios ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
      skipDuplicates: true,
    });
    await registrarActividad({
      usuarioId,
      accion: "bitacora.importar",
      entidad: "bitacora",
      resumen: `Importó ${count} registros de un archivo con ${registros.length} (los demás ya existían)`,
    });
    res.json({ recibidos: registros.length, importados: count, omitidos: registros.length - count });
  }),
);
