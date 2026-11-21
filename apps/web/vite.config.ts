import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "NEXO TIC ERP",
        short_name: "NEXO ERP",
        description: "Plataforma modular de gestión para empresas",
        theme_color: "#0b1f3a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        lang: "es-MX",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
