import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const grafanaHost = env.VITE_GRAFANA_HOST ?? "__GRAFANA_HOST__";

  const manifestPlugin = {
    name: "manifest-env-inject",
    writeBundle(options: { dir?: string }) {
      const outDir = options.dir ?? "dist";
      const dest = resolve(__dirname, outDir, "manifest.json");
      if (!fs.existsSync(dest)) return;
      const content = fs.readFileSync(dest, "utf-8");
      fs.writeFileSync(dest, content.replaceAll("__GRAFANA_HOST__", grafanaHost));
    },
  };

  return {
    base: "./",
    plugins: [react(), manifestPlugin],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, "popup.html"),
          content: resolve(__dirname, "src/content/index.ts"),
          background: resolve(__dirname, "src/background/index.ts"),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === "content") return "content.js";
            if (chunk.name === "background") return "background.js";
            return "[name].js";
          },
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
      sourcemap: true,
      minify: false,
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
  };
});
