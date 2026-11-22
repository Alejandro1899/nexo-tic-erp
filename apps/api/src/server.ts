export {};
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables del entorno.
}

const { createApp } = await import("./app.js");

const port = Number(process.env.API_PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
