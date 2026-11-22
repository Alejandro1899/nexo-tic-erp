try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: en CI las variables vienen del entorno.
}
