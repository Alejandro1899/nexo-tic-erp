/** Arma la aplicación Express: CORS, JSON, rutas por módulo y el manejador de errores. Está separada de server.ts para poder probarla. */
import express, { type Express } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { clientesRouter } from "./modules/clientes/clientes.routes.js";
import { serviciosRouter } from "./modules/servicios/servicios.routes.js";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes.js";
import { categoriasRouter } from "./modules/categorias/categorias.routes.js";
import { cotizacionesRouter } from "./modules/cotizaciones/cotizaciones.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { configuracionRouter } from "./modules/configuracion/configuracion.routes.js";
import { actividadRouter } from "./modules/actividad/actividad.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

/**
 * CORS con credenciales: solo los orígenes de WEB_ORIGIN (separados por comas) pueden
 * llamar al API desde el navegador, y la cookie de sesión viaja con ellos.
 */
function cors(): express.RequestHandler {
  const permitidos = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return (req, res, next) => {
    const origen = req.headers.origin;
    if (origen && permitidos.includes(origen)) {
      res.setHeader("Access-Control-Allow-Origin", origen);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  // La importación de la bitácora trae un archivo grande; el resto de la API conserva el límite de 100 kb.
  app.use("/api/actividad/importar", express.json({ limit: "50mb" }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/clientes", clientesRouter);
  app.use("/api/servicios", serviciosRouter);
  app.use("/api/usuarios", usuariosRouter);
  app.use("/api/categorias", categoriasRouter);
  app.use("/api/cotizaciones", cotizacionesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/configuracion", configuracionRouter);
  app.use("/api/actividad", actividadRouter);

  app.use(errorHandler);
  return app;
}
