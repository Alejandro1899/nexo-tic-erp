import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/testing/setup.ts"],
    // Las pruebas de integración comparten la base de datos: se ejecutan una por una.
    fileParallelism: false,
  },
});
