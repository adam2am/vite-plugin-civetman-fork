# vite-plugin-civetman

[![npm vite-plugin-civetman](https://img.shields.io/npm/v/vite-plugin-civetman)](https://www.npmjs.com/package/vite-plugin-civetman)

<!-- markdownlint-disable -->
<p align="center">
  <img width="120" src="https://user-images.githubusercontent.com/18894/184558519-b675a903-7490-43ba-883e-0d8addacd4b9.png" alt="Civet logo" style="border-radius:50%" />
</p>

Tiny Vite plugin that **runs Civetman automatically** during both `vite dev` and `vite build`.

It spawns the [`civetman-fork`](https://www.npmjs.com/package/civetman-fork) CLI (or the maintained fork that ships with this plugin) so you **never open a second terminal tab** just to compile `.civet` → `.ts/tsx`.

---

## Why use this plugin?

• Zero-config – drop it in and it Just Works.

• Smart CLI resolution – prefers a project-local `civetman-fork`, falls back to original `civetman`, then to an embedded copy.

• Modern features: multi-core compilation, incremental builds, source-map options, watch-mode optimisations.

---

## Install

```bash
pnpm add -D vite-plugin-civetman
# or npm i -D vite-plugin-civetman
```

---

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { civetman } from 'vite-plugin-civetman'

export default defineConfig({
  plugins: [
    civetman({
      tsx: true,                 // emit .tsx instead of .ts
      outTsx: ['src'],           // or custom TSX output directory
      inlineMap: 'none',         // if needed ontrol source-map injection
      concurrency: 4             // max parallel compiles
    })
  ]
})
```

---

## Options

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `tsx` | `boolean` | `false` | Emit **.tsx** instead of **.ts** when no folder override matches. |
| `gitIgnore` | `boolean` | `true` | Automatically append generated files to `.gitignore`. |
| `vscodeHide` | `boolean` | `true` | Hide generated files in VS Code *Files → Exclude*. |
| `inlineMap` | `'full' \| 'fileurl' \| 'none'` | `'full'` | Source-map strategy.<br>• `full` = inline base64<br>• `fileurl` = comment reference to external `.map` file (if mapFiles turned on)<br>• `none` = no source map comment |
| `mapFiles` | `boolean` | `false` | Write separate `.map` files beside outputs. |
| `ignoreFolders` | `string \| string[]` | – | Extra folders to completely ignore (in build & watch). |
| `outTs` | `string \| string[]` | – | One or more folders that should always emit **.ts** (overrides `tsx`). |
| `outTsx` | `string \| string[]` | – | One or more folders that should always emit **.tsx**. |
| `concurrency` | `number` | `CPU cores` | Parallel worker threads for compilation. `1` disables the worker pool. |
| `forcePolling` | `boolean` | `false` | Force chokidar polling (useful on network drives / WSL). |
| `onlyFolders` | `string \| string[]` | – | *Exclusive* folders to build/watch. If set, civetman ignores every path **outside** these folders. |
| `typeCheck` | `boolean` | `false` | Run `tsc --noEmit` after a successful build and fail the CLI if TypeScript errors are found. |

Any option maps 1-to-1 to a corresponding [`civetman` CLI flag](./builtin-civetman-fork/src/main.civet#L620-L650).

---

## How it works

1. During `vite dev` it spawns **`civetman dev`** once, then reconnects if the process dies.
2. During `vite build` it runs **`civetman build`** and blocks until it exits.
3. The CLI writes TypeScript/TSX files into your repo – Vite picks them up as normal source.

The forked Civetman includes:

* Worker-thread pool (multi-core compilation).
* Incremental build cache via JSON-Lines manifest.
* Smart file-watcher with optional polling.
* Safety features: atomic writes and crash-tolerant temp files.

---

## FAQ

**Q: Do I need to install `civetman` separately?**  
No. **`civetman-fork`** is built-in with up-to-dates features and flags. But you can use external no problem, otherwise the plugin falls back to its embedded copy.

**Q: Where do the compiled files go?**  
Same directory as the source by default (e.g. `foo.civet` → `foo.ts`).

**Q: How do I disable hiding files in VS Code?**  
Set `vscodeHide: false`.