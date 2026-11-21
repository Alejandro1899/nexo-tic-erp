import express, { type Express } from "express";
import { healthRouter } from "./modules/health/health.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);

  app.use(errorHandler);
  return app;
}
