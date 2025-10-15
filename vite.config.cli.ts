import { defineConfig, type PluginOption } from "vite"
import civetmanPlugin from "./index.ts"

export default defineConfig({
	build: {
		lib: {
			entry: {
				'index': './builtin-civetman-fork/index.ts',
			},
			formats: ["es"],
			fileName: () => 'index.js'
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
	plugins: [civetmanPlugin({
		tsx: false,
		gitIgnore: true,
		vscodeHide: true,
		inlineMap: 'inline',
		mapFiles: false,
		outTs: 'builtin-civetman-fork/src',
		ignoreFolders: ['node_modules', 'dist', 'tests'],
		concurrency: 4
	}) as PluginOption],
}) 