
### 🐈 civetman – Improvement Proposal Sketch  

---

## 1.  Cache `findCivetConfig` results  

### Context  
Every compile task invokes  
`findCivetConfig(ctx.cwd) → loadCivetConfig()`  
which walks up the tree on every file. On large projects this can be thousands of filesystem hits per build or rebuild.

### Why it’s appealing  
• Direct speed-up for both one-shot builds and watch-mode rebounds.  
• Implementation is tiny (memoize result + invalidate on known config-file events).  
• Zero behavioural change for users.

### Potential approach  
1. Inside `engine.civet` (and `main.civet` → `compileSource`) introduce:  
   ```civet
   configCache: Map<string, { path: string|null, cfg: any }>
   ```  
2. Memoise by `cwd` key.  
3. Invalidate cache when chokidar watcher sees a change to  
   `**/{tsconfig,package,🐈,civetconfig,civet.config}.{json,yml,yaml,civet,js}`.  
   (The watch code already restarts LS — we can piggy-back.)  

### Relevant places to touch  
* `engine.civet` – `runCompileTask` (cache hit)  
* `main.civet`  – `compileSource` (cache hit)  
* `main.civet`  – watcher `attachWatchHandlers` or debounce block (cache clear)  

---

## 2.  Optional post-build TypeScript check (`tsc --noEmit`)  

### Context  
Generated `.ts/.tsx` files compile fine syntactically, but type errors are only caught later by user’s own tooling.

### Why it’s appealing  
• Immediate red-ink at build time, better CI guarantees.  
• Opt-in flag keeps fast path unchanged (`--type-check` or `--strict`).  

### Potential approach  
1. Add CLI flag `--type-check` (boolean).  
2. After `runBuild()` succeeds, spawn:  
   ```bash
   tsc -p <ctx.cwd> --noEmit --pretty false
   ```  
   Capture exit code; fail build if non-zero.  
3. For monorepos, allow `--type-check <tsconfig-path>` override.  

### Relevant places to touch  
* CLI wiring in `main.civet` (new option).  
* End of `runBuild()` (step after IDE/VCS hygiene).  
* Docs / README.  

---

## 4.  Windows-safe glob patterns  

### Context  
`fast-glob` patterns like `"**/*.civetmantmp"` work on Unix but can mis-match on Windows because backslashes leak into the pattern.

### Why it’s appealing  
• Eliminates “file not ignored / deleted on Windows” bug reports.  
• Very low effort: sanitize patterns once.

### Potential approach  
1. When building `ignorePatterns` (build and watch paths) run:  
   ```civet
   toPosix := (p) -> p.split(path.sep).join("/")
   ignorePatterns = ignorePatterns.map(toPosix)
   ```  
2. Likewise, when generating dynamic patterns (`tmpGlob`) for VS Code or gitignore, build them with forward slashes unconditionally.

### Relevant places to touch  
* `main.civet` – `runBuild()` ignore list assembly.  
* `main.civet` – `createWatcher()` ignore list assembly.  
* `addVscodeExcludes` / `addGitignoreEntries` where patterns are emitted.

---

#### Next steps  
1. Approve the three mini-features.  
2. Land caching first (isolated, testable).  
3. Add `--type-check` flag; integrate in CI workflow.  
4. Patch glob building & run tests on Windows VM/GitHub-Actions matrix.
