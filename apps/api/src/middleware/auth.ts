/** Revisa la cookie de sesión y deja la sesión en res.locals.sesion para las rutas siguientes. */
import type { RequestHandler } from "express";
import { HttpError } from "../lib/errors.js";
import { COOKIE_SESION, leerCookie } from "../lib/http.js";
import { buscarSesion } from "../modules/auth/sesiones.js";

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = leerCookie(req.headers.cookie, COOKIE_SESION);
  if (!token) return next(new HttpError(401, "no_autenticado", "Se requiere sesión"));
  buscarSesion(token)
    .then((sesion) => {
      if (!sesion) return next(new HttpError(401, "no_autenticado", "Sesión inválida o expirada"));
      res.locals.sesion = sesion;
      next();
    })
    .catch(next);
};
