import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/docs": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/openapi.json": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/redoc": { target: "http://127.0.0.1:80", changeOrigin: true },
    },
  },
});
