import { defineConfig, Plugin } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

/**
 * Custom Vite plugin to serve VRM models directly from ../assets/models
 * and copy them to dist/models during build, avoiding Git binary duplication.
 */
function serveVrmAssetsPlugin(): Plugin {
  const assetsDir = path.resolve(__dirname, "../assets/models");

  return {
    name: "serve-vrm-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith("/models/")) {
          const modelName = path.basename(req.url.split("?")[0]);
          const modelPath = path.join(assetsDir, modelName);
          if (fs.existsSync(modelPath)) {
            res.setHeader("Content-Type", "model/gltf-binary");
            const stream = fs.createReadStream(modelPath);
            return stream.pipe(res);
          }
        }
        next();
      });
    },
    closeBundle() {
      const distModelsDir = path.resolve(__dirname, "dist/models");
      if (fs.existsSync(assetsDir)) {
        if (!fs.existsSync(distModelsDir)) {
          fs.mkdirSync(distModelsDir, { recursive: true });
        }
        const files = fs.readdirSync(assetsDir);
        for (const file of files) {
          if (file.endsWith(".vrm")) {
            const dest = path.join(distModelsDir, file);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(assetsDir, file), dest);
            }
          }
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [serveVrmAssetsPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
