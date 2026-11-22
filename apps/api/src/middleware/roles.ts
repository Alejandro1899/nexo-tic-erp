import type { Response, RequestHandler } from "express";
import type { Rol } from "@prisma/client";
import { HttpError } from "../lib/errors.js";

/**
 * Control de acceso por rol (NEXOTIC v1, una sola empresa).
 *  - La identidad sale SIEMPRE de la sesión autenticada (res.locals.sesion), nunca del cuerpo ni de la URL.
 *  - Los roles se verifican aquí, en el backend. El frontend solo oculta opciones.
 */
export interface SesionAutenticada {
  usuarioId: string;
  rol: Rol;
}

export function sesionDe(res: Response): SesionAutenticada {
  const sesion = res.locals.sesion as SesionAutenticada | undefined;
  if (!sesion?.usuarioId) throw new HttpError(401, "no_autenticado", "Se requiere sesión");
  return sesion;
}

export function requireRole(...roles: Rol[]): RequestHandler {
  return (_req, res, next) => {
    const sesion = sesionDe(res);
    if (!roles.includes(sesion.rol)) {
      throw new HttpError(403, "prohibido", "Tu rol no permite esta acción");
    }
    next();
  };
}
