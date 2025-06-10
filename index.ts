import type { ResolvedConfig, ViteDevServer, Plugin } from "vite";
import {
  fork,
  type SpawnOptions,
  type ChildProcess,
} from "node:child_process";
import { createRequire } from "module";

const requirePkg = createRequire(import.meta.url);

/**
 * Resolve the path to the civetman CLI, preferring civetman-fork if installed.
 */
function getCivetmanCliPath(): string {
  try {
    return requirePkg.resolve("civetman-fork/dist/index.js", { paths: [process.cwd()] });
  } catch {
    return requirePkg.resolve("civetman/dist/index.js", { paths: [process.cwd()] });
  }
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
}

/**
 * Vite Plugin Civetman (compile .civet to .ts)
 * @returns {Plugin}
 */
export function civetman(options: CivetmanOptions = {}): Plugin {
  let config: ResolvedConfig;
  const pluginOpts = { tsx: false, gitIgnore: true, vscodeHide: true, inlineMap: 'none' as const, mapFiles: true, ...options };
  function getFlags(): string[] {
    const flags: string[] = [];
    if (pluginOpts.tsx) flags.push("--tsx");
    if (pluginOpts.gitIgnore === false) flags.push("--no-git-ignore");
    if (pluginOpts.vscodeHide) flags.push("--vscode-hide");
    flags.push("--inline-map", pluginOpts.inlineMap);
    if (pluginOpts.mapFiles === false) flags.push("--no-map-files");
    return flags;
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
