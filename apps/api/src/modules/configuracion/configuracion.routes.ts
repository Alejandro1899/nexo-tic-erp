import express, { Router } from "express";
import { ConfiguracionActualizarSchema, LOGO_MAX_BYTES } from "@nexo/shared";
import { ruta } from "../../lib/async.js";
import { prisma } from "../../lib/db.js";
import { HttpError } from "../../lib/errors.js";
import { obtenerConfiguracion, vistaConfiguracion } from "../../lib/configuracion.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole, sesionDe } from "../../middleware/roles.js";

export const configuracionRouter = Router();

// Lectura: cualquier usuario con sesión. Cambios (datos y logo): solo ADMIN.
configuracionRouter.use(requireAuth);

/** Firma de un PNG: los primeros 8 bytes son fijos. */
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

configuracionRouter.get(
  "/",
  ruta(async (_req, res) => {
    sesionDe(res);
    const c = await obtenerConfiguracion();
    res.json({ configuracion: vistaConfiguracion(c) });
  }),
);

/** Logo en PNG. Si no hay logo, responde 404 para que la interfaz muestre un espacio vacío. */
configuracionRouter.get(
  "/logo",
  ruta(async (_req, res) => {
    sesionDe(res);
    const c = await obtenerConfiguracion();
    if (!c.logoPng) throw new HttpError(404, "sin_logo", "La empresa no tiene logo");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.type("image/png").send(c.logoPng);
  }),
);

configuracionRouter.patch(
  "/",
  requireRole("ADMIN"),
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const parsed = ConfiguracionActualizarSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "datos_invalidos", parsed.error.issues[0]?.message ?? "Datos inválidos");
    }
    await obtenerConfiguracion();
    const c = await prisma.configuracionEmpresa.update({
      where: { id: "empresa" },
      data: { ...parsed.data, actualizadoPorId: usuarioId },
    });
    res.json({ configuracion: vistaConfiguracion(c) });
  }),
);

/** Sube el logo como PNG crudo (Content-Type: image/png). Límite de LOGO_MAX_BYTES. */
const recibirPng = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  express.raw({ type: "image/png", limit: LOGO_MAX_BYTES })(req, res, (err?: unknown) => {
    if (err) return next(new HttpError(413, "logo_muy_grande", "El logo no puede pesar más de 500 KB"));
    next();
  });
};

configuracionRouter.put(
  "/logo",
  requireRole("ADMIN"),
  recibirPng,
  ruta(async (req, res) => {
    const { usuarioId } = sesionDe(res);
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new HttpError(400, "logo_invalido", "Envía el archivo PNG en el cuerpo de la petición");
    }
    if (bytes.length < FIRMA_PNG.length || !bytes.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) {
      throw new HttpError(400, "logo_invalido", "El archivo debe ser un PNG válido");
    }
    await obtenerConfiguracion();
    const c = await prisma.configuracionEmpresa.update({
      where: { id: "empresa" },
      data: { logoPng: bytes, actualizadoPorId: usuarioId },
    });
    res.json({ configuracion: vistaConfiguracion(c) });
  }),
);

configuracionRouter.delete(
  "/logo",
  requireRole("ADMIN"),
  ruta(async (_req, res) => {
    const { usuarioId } = sesionDe(res);
    await obtenerConfiguracion();
    const c = await prisma.configuracionEmpresa.update({
      where: { id: "empresa" },
      data: { logoPng: null, actualizadoPorId: usuarioId },
    });
    res.json({ configuracion: vistaConfiguracion(c) });
  }),
);
