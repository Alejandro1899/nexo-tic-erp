import type { RequestHandler } from "express";

/**
 * Reglas de multiempresa:
 *  - El tenantId sale SIEMPRE de la sesión autenticada (res.locals.sesion), nunca del cuerpo ni de la URL.
 *  - Si no hay sesión, la petición se rechaza.
 * La autenticación (sesiones o JWT) se implementa en la historia de autenticación del sprint 1.
 */
export interface SesionAutenticada {
  usuarioId: string;
  tenantId: string;
  roles: string[];
}

export const requireTenant: RequestHandler = (_req, res, next) => {
  const sesion = res.locals.sesion as SesionAutenticada | undefined;
  if (!sesion?.tenantId) {
    res.status(401).json({ error: "no_autenticado", mensaje: "Se requiere sesión" });
    return;
  }
  next();
};
