import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// `--mode store` builds the Web Store package: no .env keys, separate output folder.
export default defineConfig(({ mode }) => ({
  root: "src",
  // .env lives at the project root, not in src/. The store build must never bake in your keys.
  envDir: mode === "store" ? resolve(import.meta.dirname, "scripts/no-env") : import.meta.dirname,
  publicDir: resolve(import.meta.dirname, "public"),
  build: {
    outDir: resolve(import.meta.dirname, mode === "store" ? "release/dist" : "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, "src/background.ts"),
        popup: resolve(import.meta.dirname, "src/popup/index.html"),
        options: resolve(import.meta.dirname, "src/options/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  test: { root: import.meta.dirname, include: ["test/**/*.test.ts"] },
}));
