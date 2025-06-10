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
    // Prefer civetman-fork from the user's project
    return requirePkg.resolve("civetman-fork/dist/index.js", { paths: [process.cwd()] });
  } catch (e) {
    try {
      // Fallback to civetman with a warning
      const civetmanPath = requirePkg.resolve("civetman/dist/index.js", { paths: [process.cwd()] });
      console.log("Original civetman detected. It was 2 years without updates, so civetman-fork or deletion to activate built-in civetman recommended");
      return civetmanPath;
    } catch (e2) {
      try {
        // Fallback to the built-in civetman-fork
        console.log("Built-in civetman-fork activated");
        return requirePkg.resolve("./builtin-civetman-fork/dist/index.js");
      } catch (e3) {
        // All failed, throw an error
        console.error("Could not find civetman-fork, civetman, or the built-in civetman-fork.");
        throw new Error("civetman CLI not found. Please install `civetman-fork`.");
      }
    }
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
