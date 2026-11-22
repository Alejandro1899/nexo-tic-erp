import express, { type Express } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { clientesRouter } from "./modules/clientes/clientes.routes.js";
import { serviciosRouter } from "./modules/servicios/servicios.routes.js";
import { usuariosRouter } from "./modules/usuarios/usuarios.routes.js";
import { categoriasRouter } from "./modules/categorias/categorias.routes.js";
import { cotizacionesRouter } from "./modules/cotizaciones/cotizaciones.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/clientes", clientesRouter);
  app.use("/api/servicios", serviciosRouter);
  app.use("/api/usuarios", usuariosRouter);
  app.use("/api/categorias", categoriasRouter);
  app.use("/api/cotizaciones", cotizacionesRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(errorHandler);
  return app;
}
