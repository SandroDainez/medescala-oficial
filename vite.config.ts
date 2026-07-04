import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// ID único por build. Fica embutido no bundle (__APP_BUILD_ID__) e também é
// escrito em dist/version.json, servido sem cache. O app compara os dois e, se
// a versão publicada for diferente da que está rodando, limpa o cache e recarrega.
const BUILD_ID = String(Date.now());

export default defineConfig(() => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    {
      name: "emit-version-json",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ buildId: BUILD_ID }),
        });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: "MedEscala",
        short_name: "MedEscala",
        description: "Gestão de Escalas Médicas",
        theme_color: "#ffffff",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("react") || id.includes("scheduler")) {
            return "vendor-react";
          }
          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("@radix-ui")) {
            return "vendor-radix";
          }
          if (id.includes("date-fns")) {
            return "vendor-date";
          }
          if (id.includes("recharts") || id.includes("d3-")) {
            return "vendor-charts";
          }
          if (id.includes("@capacitor")) {
            return "vendor-capacitor";
          }
          if (id.includes("xlsx")) {
            return "vendor-xlsx";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: "::",
    port: 5173
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  }
}));
