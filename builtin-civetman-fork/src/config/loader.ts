// ──────────────────────────────────────────────────────────────
// Config loader – Loads civetman.config files (js/ts/json)
// ──────────────────────────────────────────────────────────────

import path from "node:path"
import fs from "fs-extra"
import vm from "node:vm"
import { pathToFileURL } from "node:url"
import type { CivetmanConfig } from "../types"
import { findConfig as findCivetConfig, loadConfig as loadCivetConfig } from "@danielx/civet/config"

// Try to locate civetman config in cwd
export const findCivetmanConfigPath = async (cwd: string): Promise<string | null> => {
    const base = path.resolve(cwd)
    const candidates = [
        "civetman.config.js",
        "civetman.config.ts",
        "civetman.config.json",
    ]
    for (const name of candidates) {
        const full = path.join(base, name)
        if (await fs.pathExists(full)) return full
    }
    return null
}

const loadJsConfig = async (file: string): Promise<CivetmanConfig> => {
    const url = pathToFileURL(file).href
    const mod = await import(url)
    return mod?.default ?? mod
}

const loadJsonConfig = async (file: string): Promise<CivetmanConfig> => {
    const content = await fs.readFile(file, "utf8")
    return JSON.parse(content)
}

// Minimal TS loader: executes an object-literal style default export in a VM
// This is intentionally narrow: supports `export default { ... }` configs.
const loadTsConfig = async (file: string): Promise<CivetmanConfig> => {
    const source = await fs.readFile(file, "utf8")
    // Extract after `export default`
    const idx = source.indexOf("export default")
    if (idx === -1) {
        throw new Error("civetman.config.ts must use `export default { ... }`")
    }
    const snippet = source.slice(idx + "export default".length)
    const wrapped = `(${snippet})`
    const sandbox: Record<string, unknown> = { process, __dirname: path.dirname(file), __filename: file }
    const result = vm.runInNewContext(wrapped, sandbox, { filename: file })
    return result as CivetmanConfig
}

export const loadCivetmanConfig = async (cwd: string): Promise<{ path: string | null, config: CivetmanConfig | null }> => {
    const file = await findCivetmanConfigPath(cwd)
    if (!file) return { path: null, config: null }
    if (file.endsWith(".js")) return { path: file, config: await loadJsConfig(file) }
    if (file.endsWith(".json")) return { path: file, config: await loadJsonConfig(file) }
    if (file.endsWith(".ts")) return { path: file, config: await loadTsConfig(file) }
    return { path: file, config: null }
}

export const loadBaseCivetCompileOptions = async (cwd: string) => {
    const cfgPath = await findCivetConfig(cwd)
    if (!cfgPath) return {}
    return await loadCivetConfig(cfgPath)
}

