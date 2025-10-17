import { defineConfig, type PluginOption } from "vite"
import { civetman } from "./index.js"

export default defineConfig({
	server: {
		port: 3000,
		open: false
	},
	plugins: [civetman({
		tsx: false,
		gitIgnore: true,
		vscodeHide: true,
		inlineMap: 'full',
		mapFiles: false,
		outTs: 'builtin-civetman-fork/src',
		ignoreFolders: ['node_modules', 'dist', 'tests'],
		concurrency: 4,
		force: false
	}) as PluginOption],
}) 