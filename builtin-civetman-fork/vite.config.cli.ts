import { defineConfig, type PluginOption } from "vite"
import civetVitePlugin from "@danielx/civet/vite"

export default defineConfig({
	build: {
		lib: {
			entry: {
				'index': './index.ts',
			},
			formats: ["es"],
			fileName: () => 'index'
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
	plugins: [civetVitePlugin() as PluginOption],
}) 