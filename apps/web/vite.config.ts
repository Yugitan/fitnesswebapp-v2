import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../..");
const exerciseDatasetRoot = path.resolve(repoRoot, "动作库/exercises-dataset");

function getContentType(filePath: string): string {
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".gif")) return "image/gif";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function exerciseDatasetDevServer(): Plugin {
  return {
    name: "exercise-dataset-dev-server",
    configureServer(server) {
      server.middlewares.use("/exercises-dataset", (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "/";
        const relativePath = decodeURIComponent(url.replace(/^\/+/, ""));
        const filePath = path.resolve(exerciseDatasetRoot, relativePath);

        if (!filePath.startsWith(exerciseDatasetRoot)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        fs.stat(filePath, (statError, stat) => {
          if (statError || !stat.isFile()) {
            next();
            return;
          }

          res.setHeader("Content-Type", getContentType(filePath));
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(filePath).pipe(res);
        });
      });
    },
  };
}

function copyExerciseDatasetToBuild(): Plugin {
  return {
    name: "copy-exercise-dataset-to-build",
    closeBundle() {
      fs.cpSync(exerciseDatasetRoot, path.resolve(dirname, "dist/exercises-dataset"), {
        recursive: true,
        filter(source) {
          return !source.split(path.sep).includes(".git");
        },
      });
    },
  };
}

export default defineConfig({
  // Deploy at the domain root so Cloudflare Pages can serve the SPA and its
  // exercise assets without a provider-specific rewrite rule.
  base: "/",
  plugins: [react(), exerciseDatasetDevServer(), copyExerciseDatasetToBuild()],
  resolve: {
    alias: {
      "@xiaobai-amax/domain": path.resolve(dirname, "../../packages/domain/src"),
      "@xiaobai-amax/data-client": path.resolve(dirname, "../../packages/data-client/src"),
      "@xiaobai-amax/exercise-data": path.resolve(dirname, "../../packages/exercise-data/src"),
      "@xiaobai-amax/local-db": path.resolve(dirname, "../../packages/local-db/src"),
      "@xiaobai-amax/ui": path.resolve(dirname, "../../packages/ui/src"),
      "@xiaobai-amax/utils": path.resolve(dirname, "../../packages/utils/src"),
      "@": path.resolve(dirname, "src")
    }
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
    fs: {
      allow: [repoRoot]
    }
  }
});
