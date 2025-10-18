import { defineConfig, type PluginOption } from "vite"
import { civetman } from "./index.js"

const devOutDir = 'builtin-civetman-fork/dist/dev-output';

export default defineConfig({
	server: {
		port: 3000,
		open: false,
		watch: {
			// Prevent Vite from restarting when civetman writes compiled files.
			// This is the key fix for the infinite loop.
			ignored: [`**/${devOutDir}/**`]
		}
	},
	plugins: [civetman({
		tsx: false,
		gitIgnore: true,
		vscodeHide: true,
		inlineMap: 'full',
		mapFiles: false,
		outTs: devOutDir,
		ignoreFolders: ['node_modules', 'dist', 'tests', 'builtin-civetman-fork/dist'],
		concurrency: 4,
		force: false
	}) as PluginOption],
}) 