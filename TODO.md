# Civetman Refactor Road-map
──────────────────────────────
Expected impact on scores
──────────────────────────────
Scalability +1 (worker pool, streaming manifests)
Robustness +1 (single engine, fewer code paths)
Clarity ≈ (stays high; engine class is easier to grok)
Future-proofing +1 (plugin bus)
Performance +2 (no polling by default + multi-core compile + less IO)
i.e. v1 could realistically reach ~8–9 across the board with the above refactors.

All tasks use `[ ]` check-boxes so they can be ticked off as they land.

---

## 1. Merge Build & Watch Pipelines into a Single Engine

- [x] **Context**  
  `runBuild → compileAll` (one-shot) and the `rebuildOne` logic in watch mode are near duplicates, leading to drift and bugs.

- [x] **Idea & reasons**  
  Factor out a reusable `BuildEngine` that exposes `buildAll`, `build(file)`, and `remove(file)`.  One code-path means fewer edge-cases and boosts robustness.

- [x] **Potential approach**  
  1. Create `src/engine.civet` housing an `Engine` class that stores `ctx`, a `p-limit` pool, and a dedupe map.  
  2. Re-implement `runBuild` and watch-mode so they simply call engine APIs.  
  3. Delete/deprecate duplicated helpers in `main-refactored.civet`.

- [x] **Relevant places / files**  
  `builtin-civetman-fork/src/main-refactored.civet` (sections compileAll + watch), new `src/engine.civet`, test updates.

---

## 2. Stream / Append Manifests Instead of Re-writing

- [x] **Context**  
  `saveNewState` rewrites whole `manifest.json` and `hashes.json`, causing O(total files) IO.

- [x] **Idea & reasons**  
  Move to JSON-Lines (one JSON object per line) or a light embedded DB so only changed entries are written, improving performance on large repos.

- [x] **Potential approach**  
  1. Introduce `jsonlAppend(file, obj)` helper.  
  2. On load stream file line-by-line into Map; on save append only new/changed lines.  
  3. Keep a migration path that auto-detects old manifest version and converts.

- [x] **Relevant places / files**  
  `loadJSON`, `saveJSON`, `saveNewState` in `main-refactored.civet`; new `helpers/manifest.civet`.

---

## 3. Worker-Thread Pool for Compilation

- [ ] **Context**  
  Compilation is CPU-bound but still runs on the main thread; `p-limit` restricts concurrency but doesn't scale across cores.

- [ ] **Idea & reasons**  
  Off-load `compileSource` to a worker pool to utilise multi-core CPUs → faster cold builds.

- [ ] **Potential approach**  
  1. Add `worker_threads` pool utility (`utils/workerPool.ts`).  
  2. Wrap `compileSource` behind an adapter that decides between in-process vs worker based on `opts.concurrency`.  
  3. Pass only serialisable data (file path & options) to workers.

- [ ] **Relevant places / files**  
  `compileSource` in `main-refactored.civet`, new `workers/compileWorker.cjs`.

---

## 4. Smarter Watcher Defaults

- [x] **Context**  
  Current watcher uses `usePolling: true`, which is reliable but CPU-heavy during dev.

- [x] **Idea & reasons**  
  Detect environment: default to native events locally, fall back to polling in CI or when `--force-polling` flag supplied.

- [x] **Potential approach**  
  1. Read `process.env.CI` and a new CLI flag.  
  2. Pass `usePolling` accordingly when creating each chokidar watcher.  
  3. Add docs.

- [x] **Relevant places / files**  
  `createWatcher` in `main-refactored.civet`, CLI options definition.

---

## 5. Public Plugin / Event Hooks

- [ ] **Context**  
  Users may want to run extra steps (e.g. minify, lint) without forking core.

- [ ] **Idea & reasons**  
  Expose an internal `EventEmitter` that fires `compiled`, `skipped`, `deleted` etc.  CLI can load external JS plugins that subscribe, improving future-proofing.

- [ ] **Potential approach**  
  1. Add `events` property to `BuildEngine`.  
  2. Introduce `--plugin <file>` CLI flag that dynamically imports modules and hands them the emitter.  
  3. Document simple "hello-plugin" example.

- [ ] **Relevant places / files**  
  New `plugins` folder, `BuildEngine`, CLI wiring in `main-refactored.civet`.

---

## 6. Micro-optimisations & Housekeeping

- [ ] Cache file contents + hashes in memory during watch to avoid redundant disk reads.  
- [ ] Skip `sourceMap.json()` call when both `inlineMap === 'none'` and `!opts.mapFiles`.  
- [ ] Switch `debounce` helper to execute immediately on first call (`leading`) then batch later calls.  
- [ ] Tighten types and remove any `as any` casts.  
- [ ] Add unit benchmarks for cold vs. warm builds.

Relevant areas: `compileSource`, debounce util, tests/benchmarks.

---

**End of list** 