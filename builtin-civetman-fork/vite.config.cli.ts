import { defineConfig, type PluginOption } from "vite"
import civetVitePlugin from "@danielx/civet/vite"

export default defineConfig({
  build: {
    ssr: true,
    lib: {
      entry: {
        'index': './index.ts',
        'workers/compileWorker': './src/workers/compileWorker.civet'
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
        "chokidar",
        "ora",
        /node:.*/gi,
      ],
    },
  },
  plugins: [civetVitePlugin({
    ts: "esbuild"
  }) as PluginOption],
}) 