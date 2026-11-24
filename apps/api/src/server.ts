/** Punto de entrada: arranca el servidor HTTP en el puerto indicado por API_PORT (4000 por defecto). */
export {};
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables del entorno.
}

const { createApp } = await import("./app.js");

// Render asigna el puerto en PORT; en local se usa API_PORT (por defecto 4000).
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
