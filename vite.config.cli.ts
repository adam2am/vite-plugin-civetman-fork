import { defineConfig, type PluginOption } from "vite"
import { civetman } from "vite-plugin-civetman-fork"

export default defineConfig({
	server: {
		port: 3000,
		open: false,
		watch: {
			// Prevent Vite from restarting when civetman writes compiled files.
			// This is the key fix for the infinite loop.
			ignored: ['**/builtin-civetman-fork/src/**/*.ts']
		}
	},
	plugins: [civetman({
		tsx: false,
		gitIgnore: true,
		vscodeHide: true,
		inlineMap: 'full',
		mapFiles: false,
		ignoreFolders: ['node_modules', 'dist'],
	}) as PluginOption],
}) 