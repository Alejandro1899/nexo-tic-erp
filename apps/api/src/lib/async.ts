import type { Request, RequestHandler, Response } from "express";

/** Envuelve un handler async para que sus errores lleguen al manejador global (Express 4). */
export function ruta(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}
