# TODO – Make `src/main-refactored.civet` production-ready

1. [x] Remove duplicate *placeholder* block (≈ lines 400-440) that redeclares `compileAll`, `syncIDEConfigs`, etc. – these empty stubs currently shadow the real implementations.

2. [x] Build-state initialisation
   • [x] Implement `initOutputTracking(ctx, civetFiles)`
     – Load `.civetman/manifest.json` and `hashes.json`.
     – Call `cleanupTmpFiles` for all potential outputs.
     – Populate `ctx.prevGenerated` / `ctx.prevHashes` and return updated ctx.

3. [x] Compilation queue
   • [x] Complete `compileAll(ctx)`
     – Use `p-limit` with `ctx.opts.concurrency`.
     – For each source file:
         a. Decide ts/tsx via `resolveOutputType(ctx, file)`.
         b. Compute sha1, compare against `ctx.prevHashes`.
         c. Call `compileSource(ctx, file)` when rebuild is required.

4. [x] IDE / VCS hygiene
   • [x] Implement `syncIDEConfigs(ctx)`.
     – Move logic from `addVscodeExcludes` + `addGitignoreEntries` into this helper so the UI layer only calls one function.

5. [x] Error reporting
   • [x] Add coloured banner / exit-code handling around `compileSource` (reuse `compileFile` pattern from original version).

6. [x] Hash manifest & pruning
   • [x] Ensure `saveNewState(ctx)` persists both generated files and hash map.
   • [x] Bring back stale-output pruning parity with old `pruneStaleOutputs`.

7. [x] Watch mode
   • [x] After each rebuild in `registerDevCommand`:
       – Update `ctx.prevHashes` with `ctx.newHashes`.
       – Call `syncIDEConfigs(ctx)` so VSCode + .gitignore stay current.

8. Tests
   • Port existing vitest suites to exercise refactored helpers.
   • Add regression tests for `resolveOutputType` folder routing logic.

9. Documentation
   • Update README with new CLI options / architecture notes once refactor is complete.
