import { defineConfig } from "vite"
import { civetman } from "../index"

export default defineConfig({
  plugins: [civetman()],
  build: {
    ssr: true,
    // Emit directly to the repository root's dist/cli for tests and usage
    outDir: '../dist/cli',
    lib: {
      entry: {
        'index': './index.ts',
        'workers/compileWorker': './src/worker/compile.worker.ts',
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
  }
}) 