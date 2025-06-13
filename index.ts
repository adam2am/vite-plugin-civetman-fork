import type { ResolvedConfig, ViteDevServer, Plugin } from "vite";
import {
  fork,
  type SpawnOptions,
  type ChildProcess,
} from "node:child_process";
import { createRequire } from "module";
import * as path from "path";
import { fileURLToPath } from "url";

const requirePkg = createRequire(import.meta.url);
// Determine current directory (dist) for built-in CLI
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the path to the civetman CLI, preferring civetman-fork if installed.
 */
function getCivetmanCliPath(): string {
  let cliPath: string;
  try {
    // Prefer user-installed civetman-fork
    cliPath = requirePkg.resolve("civetman-fork/dist/index.js", { paths: [process.cwd()] });
    console.log("Using project-installed civetman-fork");
  } catch {
    try {
      // Fallback to original civetman with a warning
      cliPath = requirePkg.resolve("civetman/dist/index.js", { paths: [process.cwd()] });
      console.log("Original civetman detected. It was 2 years without updates, so civetman-fork or deletion to activate built-in civetman recommended");
    } catch {
      // Fallback to the built-in civetman-fork (embedded)
      cliPath = path.join(__dirname, "cli", "index.js");
      console.log("Built-in civetman-fork activated");
    }
  }
  return cliPath;
}

/**!
 * Helper to run civetman in another process
 * @param {"dev" | "build"} command
 * @param {SpawnOptions} opt 
 * @returns {ChildProcess} 
 */
function runCivetmanCli(command: "dev" | "build", flags: string[] = [], opt: SpawnOptions = {}): ChildProcess {
  const cliPath = getCivetmanCliPath();
  const program = fork(cliPath, [command, ...flags], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: { PATH: process.env.PATH, FORCE_COLOR: "1" },
    cwd: process.cwd(),
    ...opt,
  });
  globalThis.process.on("exit", () => {
    program.kill("SIGTERM")
  })
  return program;
}

interface CivetmanOptions {
  /** Generate .tsx files instead of .ts */
  tsx?: boolean;
  vscodeHide?: boolean;
  gitIgnore?: boolean;
  inlineMap?: 'full' | 'fileurl' | 'none';
  mapFiles?: boolean;
  outTs?: string | string[];
  outTsx?: string | string[];
  concurrency?: number; // max parallel compilations
}

/**
 * Vite Plugin Civetman (compile .civet to .ts)
 * @returns {Plugin}
 */
export function civetman(options: CivetmanOptions = {}): Plugin {
  let config: ResolvedConfig;
  const pluginOpts = {
    tsx: false,
    gitIgnore: true,
    vscodeHide: true,
    inlineMap: 'full' as const,
    mapFiles: false,
    outTs: [],
    outTsx: [],
    concurrency: undefined as number | undefined,
    ...options
  };
  // Default output dirs if none specified
  const cwdDir = process.cwd();
  if (!pluginOpts.outTs.length && !pluginOpts.outTsx.length) {
    if (pluginOpts.tsx) pluginOpts.outTsx = [cwdDir];
    else pluginOpts.outTs = [cwdDir];
  } else if (pluginOpts.tsx && !pluginOpts.outTsx.length) {
    // if tsx mode and outTsx not provided, default to cwd
    pluginOpts.outTsx = [cwdDir];
  }

  // Define flag generators keyed by option name
  const flagGenerators: Record<keyof CivetmanOptions, (value: any) => string[]> = {
    tsx:       (v: boolean) => v ? ['--tsx'] : [],
    gitIgnore: (v: boolean) => v === false ? ['--no-git-ignore'] : [],
    vscodeHide:(v: boolean) => v === false ? ['--no-vscode-hide'] : [],
    inlineMap: (v: string)  => ['--inline-map', v],
    mapFiles:  (v: boolean) => v ? ['--map-files'] : [],
    outTs:     (value: string | string[]) => {
      if (!value || value.length === 0) return [];
      const dirs = Array.isArray(value) ? value : [value];
      return dirs.flatMap(dir => ['--out-ts', dir]);
    },
    outTsx:    (value: string | string[]) => {
      if (!value || value.length === 0) return [];
      const dirs = Array.isArray(value) ? value : [value];
      return dirs.flatMap(dir => ['--out-tsx', dir]);
    },
    concurrency: (n: number) => Number.isFinite(n) ? ['--concurrency', String(n)] : [],
  } as any;
  // Specify order of flags
  const flagOrder: (keyof typeof flagGenerators)[] = [
    'tsx', 'gitIgnore', 'vscodeHide', 'inlineMap', 'mapFiles', 'outTs', 'outTsx', 'concurrency'
  ];

  function getFlags(): string[] {
    return flagOrder.flatMap(key => flagGenerators[key](pluginOpts[key as keyof CivetmanOptions]));
  }

  return {
    name: "vite-plugin-civetman" as const,
    configResolved(resolvedConfig: ResolvedConfig) {
      console.log('vite plugin')
      config = resolvedConfig;
    },
    async buildStart() {
      if (config.command == "build") {
        const process = runCivetmanCli("build", getFlags());
        await new Promise<void>((resolve, reject) => {
          process.on("exit", (code ) => {
            if (code == 0) {
              resolve()
            } else {
              reject(new Error(`Civet Compile Error`))
            }
          });
        });
      }
    },
    async configureServer(server: ViteDevServer) {
      if (config.command == "serve") {
        let process: ChildProcess | undefined = undefined;
        function tryCompileCivetmanWatch() {
          if (process) return;
          process = runCivetmanCli("dev", getFlags());
          process.on("exit", code => {
            console.error("CIVETMAN compile error is exit code=", code)
            process = undefined
          })
        }
        tryCompileCivetmanWatch();
        server.watcher.add('**/*.civet');
        server.watcher.on("change", path => {
          if (path.endsWith(".civet")) {
            tryCompileCivetmanWatch();
          }
        })
      }
    },
  }
}
