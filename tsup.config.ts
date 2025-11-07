import { defineConfig } from 'tsup'

export default defineConfig({
	target: "esnext",
	format: "esm",
	outDir: "./dist",
	entry: ["./index.ts"],
	// Preserve Vite-built CLI artifacts in dist/cli
	clean: false,
	dts: true,
	minify: false,
	sourcemap: true,
	shims: false,
})