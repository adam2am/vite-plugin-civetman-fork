# High-ROI Improvements Todo List

## Context
The refactored Civetman build system is split into several small modules:
* `engine.civet` orchestrates build logic and decides between in-process vs. worker compilation.
* `workerPool.civet` manages a tiny pool of `Worker` threads.
* `compileWorker.civet` performs the actual Civet → TS/TSX compilation.
* `main-refactored.civet` hosts CLI / watch logic and also contains a duplicate copy of some hashing logic.

The system works well, but a few small inconsistencies leave easy performance and robustness gains on the table.

---

## Idea & Reasons
1. **Send file content to the worker**  
   Saves one disk read per compilation → faster I/O, less contention on slow or networked filesystems.
2. **Auto-respawn crashed workers**  
   Prevents pool starvation if a worker exits abnormally → higher robustness during large builds or flaky compiler bugs.
3. **Single source of truth for signature hashing**  
   Removes duplicated code paths → easier maintenance, lower bug surface when the hash formula changes.

Combined, these tweaks can raise the codebase scores by roughly +1 in performance, scalability, robustness and clarity.

---

## Potential Approaches
* **(1) Pass `content` through the pool**  
  a. In `engine.civet` when posting to the worker, include the already-loaded `content`.  
  b. In `compileWorker.civet`, use `msg.content` if provided, otherwise fall back to `fs.readFile`.
* **(2) Add a simple exit handler in the pool**  
  Attach an `"exit"` listener to every new `Worker` that removes it from the idle list if it exits with a non-zero code.
* **(3) Extract `makeSignature()` helper**  
  Move the SHA-1 computation into a small exported function (e.g. in `hash-utils.civet`) and import it where needed.

---

## Relevant Places / Files
* `src/engine.civet`  – build orchestration & signature calculation
* `src/workers/compileWorker.civet`  – worker thread implementation
* `src/workerPool.civet`  – pool lifecycle management
* `src/main-refactored.civet`  – duplicate signature logic

---

## TODO Checklist
- [x] **Eliminate extra disk read**
  - [x] `engine.civet`: include `content` in the payload of `@pool.exec()`
  - [x] `compileWorker.civet`: prefer `msg.content` over re-reading the file
  - [x] Verify source-map generation still works
- [x] **Auto-respawn workers**
  - [x] `workerPool.civet`: add `worker.on("exit", …)` handler
  - [x] Write a quick unit test that force-terminates a worker (simulating crash) and confirms respawn
- [x] **Deduplicate signature logic**
  - [x] Create helper `makeSignature(content, opts, isTsx)` (new file `hash-utils.civet` or inside `main-refactored.civet`)
  - [x] Replace inline hash computations in `engine.civet` & `main-refactored.civet` with this helper
  - [x] Run `npm test` or a full build to ensure identical skip behaviour 