import { defineConfig } from "vite"
import { civetman } from "../index"

export default defineConfig({
  plugins: [civetman()],
  build: {
    ssr: true,
    outDir: 'dist',
    lib: {
      entry: {
        'index': './index.civet',
        'workers/compileWorker': './src/worker/compile.worker.civet',
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => format === 'es' ? `${entryName}.js` : `${entryName}.cjs`
    },
    minify: false,
    rollupOptions: {
      external: [
        "picocolors",
        "commander",
        "fs-extra",
        "fast-glob",
        "@danielx/civet",
        "@danielx/civet/config",
        "@typescript/vfs",
        "chokidar",
        "ora",
        "micromatch",
        "jsonc-parser",
        /node:.*/gi,
      ],
    },
  },
  plugins: [],
}) 