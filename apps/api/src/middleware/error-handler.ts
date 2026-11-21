import type { ErrorRequestHandler } from "express";

/** Respuestas de error uniformes. No expone detalles internos al cliente. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "error_interno" : (err.code ?? "solicitud_invalida"),
    mensaje: status >= 500 ? "Error interno del servidor" : err.message,
  });
};
