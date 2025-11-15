# Design Document

## Overview

This design document outlines the refactoring of vite-plugin-civetman-fork to eliminate the inefficient `child_process.fork()` pattern and establish a clean, performant in-process API architecture. The refactored system will expose civetman-fork's core compilation and watching functionality as a programmatic API that the Vite plugin can call directly, eliminating inter-process communication overhead and enabling better integration with Vite's build pipeline.

The design follows a layered architecture where:
1. **CivetmanCore** provides a public API module exposing build and watch functions
2. **VitePlugin** consumes this API through standard ES module imports
3. **WorkerPool** remains internal to CivetmanCore for parallel compilation
4. **Integration Layer** translates between Vite's plugin interface and CivetmanCore's API

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Vite Build System                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Plugin Hooks
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    VitePlugin Layer                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • buildStart() hook                                  │  │
│  │  • configureServer() hook                             │  │
│  │  • transform() hook (inline compilation)              │  │
│  │  • Options translation                                │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Direct Function Calls (InProcessAPI)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  CivetmanCore Public API                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  export { orchestrateBuild, createWatcher,           │  │
│  │           attachWatchHandlers, registerWatcher }     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  BuildOrchestrator                                    │  │
│  │  • Coordinates parallel compilation                   │  │
│  │  • Manages state and caching                          │  │
│  │  • Returns typed results                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WatchManager                                         │  │
│  │  • File watching with chokidar                        │  │
│  │  • Incremental compilation                            │  │
│  │  • State synchronization                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  BuildEngine (Internal)                               │  │
│  │  • WorkerPool management                              │  │
│  │  • Parallel task distribution                         │  │
│  │  • Result aggregation                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Build Mode Flow
```
User runs `vite build`
    ↓
VitePlugin.buildStart() invoked
    ↓
Check for circular dependency (building CLI itself)
    ↓ (if not circular)
Translate CivetmanOptions → BuildContext
    ↓
Call orchestrateBuild(cwd, options, workerScriptPath, throwOnError=true)
    ↓
BuildOrchestrator:
  1. Glob source files
  2. Load previous state
  3. Initialize BuildEngine with WorkerPool
  4. Compile files in parallel
  5. Update state and prune stale outputs
  6. Sync IDE configs
    ↓
Return { ctx, engine, hadError }
    ↓
VitePlugin handles errors or continues build
    ↓
BuildEngine.pool.shutdown() to clean up workers
```

#### Dev Mode Flow
```
User runs `vite dev`
    ↓
VitePlugin.configureServer() invoked
    ↓
Call orchestrateBuild() for initial compilation
    ↓
Create watcher with createWatcher(cwd, options)
    ↓
Attach handlers with attachWatchHandlers(watcher, ctx, cwd, saveCallback, engine)
    ↓
Register watcher with registerWatcher(watcher, ctx)
    ↓
Watcher monitors file changes:
  • add → compile new file
  • change → recompile file
  • unlink → remove outputs and update state
    ↓
On each change:
  1. engine.build(file) compiles single file
  2. Update ctx.newHashes and ctx.outFiles
  3. syncIDEConfigs() updates .gitignore and VS Code settings
  4. saveNewState() persists state
    ↓
On SIGINT:
  1. Close watcher
  2. Merge ctx.newHashes into ctx.prevHashes
  3. saveNewState()
  4. Exit gracefully
```

## Components and Interfaces

### 1. VitePlugin Integration Layer

**Location:** `index.civet` (modified)

**Key Changes:**

#### Remove ProcessFork Pattern
```typescript
// BEFORE (current implementation)
function runCivetmanCli(command: "dev" | "build", flags: string[], opt: SpawnOptions): ChildProcess {
  const cliPath = getCivetmanCliPath();
  const program = fork(cliPath, [command, ...flags], { ... });
  return program;
}

// AFTER (refactored implementation)
// No fork() calls - direct imports from core modules
import { orchestrateBuild } from "./builtin-civetman-fork/src/core/orchestrator.civet"
import { saveNewState } from "./builtin-civetman-fork/src/core/state.civet"
import { syncIDEConfigs } from "./builtin-civetman-fork/src/support/integrations.civet"
import type { Options, BuildContext } from "./builtin-civetman-fork/src/support/config.civet"
import type { BuildEngine } from "./builtin-civetman-fork/src/core/engine.civet"
```

#### Refactor buildStart() Hook
```typescript
async buildStart() {
  if (config.command === "build") {
    // Check for circular dependency
    const isBuildingCli = config.root.includes("builtin-civetman-fork");
    if (isBuildingCli) {
      return; // Only use transform() for inline compilation
    }

    // Translate plugin options to CivetmanCore format
    const buildOptions: Options = translateOptions(pluginOpts, config.root);
    
    // Resolve worker script path
    const workerScriptPath = path.join(__dirname, 'cli', 'workers', 'compileWorker.cjs');
    
    try {
      // Direct API call - no fork()
      const { ctx, engine, hadError } = await orchestrateBuild(
        config.root,
        buildOptions,
        workerScriptPath,
        true // throwOnError
      );
      
      // Clean up worker pool
      await engine.pool.shutdown();
      
      if (hadError) {
        this.error(new Error("Civet compilation failed"));
      }
    } catch (err) {
      this.error(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
```

#### Refactor configureServer() Hook
```typescript
async configureServer(server: ViteDevServer) {
  if (config.command === "serve") {
    const buildOptions: Options = translateOptions(pluginOpts, config.root);
    const workerScriptPath = path.join(__dirname, 'cli', 'workers', 'compileWorker.cjs');
    
    // Initial build
    const { ctx, engine, hadError } = await orchestrateBuild(
      config.root,
      buildOptions,
      workerScriptPath,
      false // don't throw on error in dev mode
    );
    
    if (hadError) {
      console.warn("[civetman-vite] Initial build had errors, but continuing in watch mode");
    }
    
    // Use Vite's existing watcher instead of creating a new one
    server.watcher.add('**/*.civet');
    
    // Debounce map to prevent rapid recompilations
    const rebuildTimers = new Map<string, NodeJS.Timeout>();
    
    // State save callback
    const saveStateAndSync = async () => {
      ctx.prevHashes = { ...ctx.prevHashes, ...ctx.newHashes };
      ctx.newHashes = {};
      await saveNewState(ctx);
    };
    
    // Helper to schedule debounced rebuild
    const scheduleRebuild = (file: string) => {
      const existing = rebuildTimers.get(file);
      if (existing) clearTimeout(existing);
      rebuildTimers.set(file, setTimeout(async () => {
        rebuildTimers.delete(file);
        try {
          const result = await engine.build(file);
          if (result.status === 'built') {
            ctx.outFiles.add(result.outFile);
            if (result.mapFile) ctx.outFiles.add(result.mapFile);
            const fileRel = path.relative(ctx.cwd, result.file);
            const outRel = path.relative(ctx.cwd, result.outFile);
            ctx.newHashes[toPosix(fileRel)] = { sig: result.signature, outFile: toPosix(outRel) };
            await syncIDEConfigs(ctx);
            await saveStateAndSync();
          }
        } catch (err) {
          console.error('[civetman-vite] Compilation error:', err);
        }
      }, 100));
    };
    
    // Attach handlers to Vite's watcher
    server.watcher.on('add', (file: string) => {
      if (!file.endsWith('.civet')) return;
      const abs = path.resolve(config.root, file);
      if (!ctx.sources.includes(abs)) {
        ctx.sources.push(abs);
      }
      scheduleRebuild(abs);
    });
    
    server.watcher.on('change', (file: string) => {
      if (!file.endsWith('.civet')) return;
      const abs = path.resolve(config.root, file);
      scheduleRebuild(abs);
    });
    
    server.watcher.on('unlink', async (file: string) => {
      if (!file.endsWith('.civet')) return;
      const abs = path.resolve(config.root, file);
      const update = engine.createRemoveUpdate(abs);
      ctx.sources = ctx.sources.filter(s => s !== abs);
      
      // Delete output files
      for (const fileToDelete of update.filesToDelete) {
        try {
          if (await fs.pathExists(fileToDelete)) {
            await fs.unlink(fileToDelete);
          }
        } catch (err) {
          console.error('[civetman-vite] Failed to delete:', fileToDelete, err);
        }
      }
      
      // Update state
      for (const file of update.filesToDelete) {
        ctx.outFiles.delete(file);
      }
      if (update.hashesToDelete) {
        for (const file of update.hashesToDelete) {
          delete ctx.prevHashes[file];
          delete ctx.newHashes[file];
        }
      }
      await saveStateAndSync();
    });
    
    // Clean up on server close
    server.httpServer?.on('close', async () => {
      await saveStateAndSync();
      await engine.pool.shutdown();
    });
  }
}
```

#### Options Translation Function
```typescript
function translateOptions(pluginOpts: CivetmanOptions, cwd: string): Options {
  return {
    tsx: pluginOpts.tsx ?? false,
    gitIgnore: pluginOpts.gitIgnore ?? true,
    vscodeHide: pluginOpts.vscodeHide ?? true,
    inlineMap: pluginOpts.inlineMap ?? 'full',
    mapFiles: pluginOpts.mapFiles ?? false,
    outTs: Array.isArray(pluginOpts.outTs) ? pluginOpts.outTs : 
           pluginOpts.outTs ? [pluginOpts.outTs] : [],
    outTsx: Array.isArray(pluginOpts.outTsx) ? pluginOpts.outTsx :
            pluginOpts.outTsx ? [pluginOpts.outTsx] : [],
    concurrency: pluginOpts.concurrency,
    forcePolling: pluginOpts.forcePolling ?? false,
    ignoreFolders: Array.isArray(pluginOpts.ignoreFolders) ? pluginOpts.ignoreFolders :
                   pluginOpts.ignoreFolders ? [pluginOpts.ignoreFolders] : [],
    onlyFolders: Array.isArray(pluginOpts.onlyFolders) ? pluginOpts.onlyFolders :
                 pluginOpts.onlyFolders ? [pluginOpts.onlyFolders] : [],
    force: pluginOpts.force ?? false,
  };
}
```

### 2. BuildEngine and WorkerPool

**Location:** `builtin-civetman-fork/src/core/engine.civet` (existing, minimal changes)

**Responsibilities:**
- Manage worker thread pool for parallel compilation
- Distribute compilation tasks to workers
- Aggregate results from workers
- Handle worker lifecycle (initialization, shutdown)

**Key Methods:**
```typescript
class BuildEngine {
  constructor(ctx: BuildContext, workerScriptPath: string)
  
  async buildAll(onProgress?: (result: CompileResult) => void): Promise<CompileResult[]>
  
  async build(file: string): Promise<CompileResult>
  
  createRemoveUpdate(file: string): CompileStateUpdate
  
  pool: WorkerPool // exposed for shutdown
}
```

**Changes Required:**
- Ensure `pool` property is publicly accessible for shutdown
- Add timeout mechanism (30 seconds) for `buildAll()` to prevent hangs
- Ensure all methods work correctly when called from VitePlugin context

### 3. Vite Watcher Integration

**Location:** `index.civet` (VitePlugin's configureServer hook)

**Responsibilities:**
- Use Vite's existing chokidar watcher instance (`server.watcher`)
- Handle file system events (add, change, unlink) for .civet files
- Trigger incremental compilation through BuildEngine
- Update BuildContext state
- Sync IDE configurations

**Integration Pattern:**
```typescript
// Add .civet files to Vite's watcher
server.watcher.add('**/*.civet');

// Attach event handlers
server.watcher.on('add', handleAdd);
server.watcher.on('change', handleChange);
server.watcher.on('unlink', handleUnlink);
```

**Integration Notes:**
- No separate chokidar instance is created - we reuse Vite's watcher
- File changes trigger `engine.build(file)` for single-file compilation
- State updates are applied immediately and persisted via `saveStateAndSync` callback
- Debouncing prevents rapid recompilations of the same file
- Cleanup happens on server close, not SIGINT (Vite handles that)

## Data Models

### Options (CivetmanCore Configuration)
```typescript
interface Options {
  tsx: boolean;
  gitIgnore: boolean;
  vscodeHide: boolean;
  inlineMap: 'full' | 'fileurl' | 'none';
  mapFiles: boolean;
  outTs: string[];
  outTsx: string[];
  concurrency?: number;
  forcePolling: boolean;
  ignoreFolders: string[];
  onlyFolders: string[];
  force: boolean;
}
```

### BuildContext (Compilation State)
```typescript
interface BuildContext {
  opts: Options;
  cwd: string;
  sources: string[];              // absolute paths to source files
  outFiles: Set<string>;          // absolute paths to generated files
  prevGenerated: Set<string>;     // previous build's output files
  prevHashes: Record<string, { sig: string; outFile: string }>; // relative POSIX paths as keys
  newHashes: Record<string, { sig: string; outFile: string }>;  // relative POSIX paths as keys
  parseOpts: CivetParseOptions | null;
  configContent: CivetmanConfig | null;
}
```

### CompileResult (Single File Compilation Result)
```typescript
type CompileResult = 
  | { status: "built"; file: string; outFile: string; signature: string; mapFile?: string }
  | { status: "skip"; file: string; outFile: string; signature: string; mapFile?: string }
  | { status: "error"; file: string; outFile: string; error: Error; signature: string }
```

## Error Handling

### Build Errors

**Strategy:** Fail fast in build mode, continue in dev mode

**Implementation:**
1. `orchestrateBuild()` accepts a `throwOnError` parameter
2. In build mode (`throwOnError=true`):
   - Compilation errors are collected during `buildAll()`
   - If any errors occurred, throw after cleanup: `throw new Error("Build failed with errors")`
   - VitePlugin catches and propagates to Vite: `this.error(err)`
3. In dev mode (`throwOnError=false`):
   - Errors are logged but don't stop the watcher
   - Individual file errors are reported via `logWatchEventError()`
   - Build continues for other files

### Timeout Handling

**Problem:** Long-running or hung compilations can block the build

**Solution:** Implement timeout in `orchestrateBuild()`

```typescript
async function orchestrateBuild(...): Promise<...> {
  // ... setup code ...
  
  const buildPromise = engine.buildAll(onProgress);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Build timeout after 30 seconds")), 30000);
  });
  
  try {
    results = await Promise.race([buildPromise, timeoutPromise]);
  } catch (err) {
    await engine.pool.shutdown(); // ensure cleanup
    throw err;
  }
  
  // ... rest of function ...
}
```

### Worker Pool Cleanup

**Problem:** Worker threads must be terminated to allow process exit

**Solution:** Always call `engine.pool.shutdown()` in finally blocks

```typescript
// In VitePlugin buildStart()
try {
  const { ctx, engine, hadError } = await orchestrateBuild(...);
  // ... handle results ...
} finally {
  if (engine) {
    await engine.pool.shutdown();
  }
}

// In VitePlugin configureServer()
server.httpServer?.on('close', async () => {
  await watcher.close();
  await engine.pool.shutdown();
});
```

### Circular Dependency Detection

**Problem:** Building the CLI itself creates a circular dependency

**Solution:** Detect and skip orchestration when building CLI

```typescript
const isBuildingCli = config.root.includes("builtin-civetman-fork");
if (isBuildingCli) {
  // Only use transform() hook for inline compilation
  return;
}
```

## Testing Strategy

### Unit Tests

**Target:** CivetmanCore public API functions

**Test Cases:**
1. `orchestrateBuild()` with various options
2. `orchestrateBuild()` error handling and timeout
3. `createWatcher()` with different ignore patterns
4. `attachWatchHandlers()` event handling
5. Worker pool initialization and shutdown
6. State persistence and loading

**Tools:** Vitest with mocked file system

### Integration Tests

**Target:** VitePlugin with CivetmanCore API

**Test Cases:**
1. Build mode: successful compilation
2. Build mode: compilation errors propagate correctly
3. Build mode: timeout handling
4. Dev mode: initial build + watcher setup
5. Dev mode: file add/change/unlink events
6. Dev mode: graceful shutdown on server close
7. Circular dependency detection
8. Options translation correctness

**Tools:** Vitest with real Vite instance

### Performance Tests

**Target:** Verify 20% performance improvement

**Test Cases:**
1. Baseline: measure current fork() implementation time
2. Refactored: measure new in-process API time
3. Compare on projects with 10, 50, 100 Civet files
4. Verify improvement meets 20% threshold

**Tools:** Vitest with performance.now() timing

### Regression Tests

**Target:** Ensure existing functionality still works

**Test Cases:**
1. All existing plugin options work correctly
2. Source maps are generated correctly
3. IDE integration (.gitignore, VS Code settings) works
4. State caching works (skip unchanged files)
5. Import rewriting works correctly

**Tools:** Existing test suite (builtin-civetman-fork/tests)

## Migration Path

### Phase 1: Refactor VitePlugin
1. Remove `getCivetmanCliPath()` and `runCivetmanCli()` functions
2. Import functions directly from core modules (orchestrator, state, integrations)
3. Implement `translateOptions()` helper
4. Refactor `buildStart()` to use `orchestrateBuild()` directly
5. Refactor `configureServer()` to integrate with Vite's watcher
6. Add timeout handling and cleanup logic

### Phase 2: Testing
1. Write unit tests for public API
2. Write integration tests for VitePlugin
3. Run performance benchmarks
4. Run regression tests

### Phase 3: Documentation
1. Update README with new architecture explanation
2. Add API documentation for public functions
3. Add migration guide for users (no changes needed for them)
4. Update inline code comments

### Phase 4: Cleanup
1. Remove unused fork() related code
2. Remove CLI path resolution logic
3. Update build scripts if needed
4. Final code review and polish

## Performance Considerations

### Expected Improvements

1. **Eliminated IPC Overhead:** No serialization/deserialization of messages between processes
2. **Shared Memory:** BuildContext and results stay in memory, no copying
3. **Faster Startup:** No process spawning overhead
4. **Better Error Propagation:** Direct exception handling instead of exit codes

### Benchmarking Plan

```typescript
// Performance test structure
describe('Performance Comparison', () => {
  it('should be 20% faster than fork() implementation', async () => {
    const testProject = createTestProject(50); // 50 .civet files
    
    // Measure baseline (fork implementation)
    const baselineStart = performance.now();
    await runWithFork(testProject);
    const baselineTime = performance.now() - baselineStart;
    
    // Measure refactored (in-process implementation)
    const refactoredStart = performance.now();
    await runWithAPI(testProject);
    const refactoredTime = performance.now() - refactoredStart;
    
    const improvement = (baselineTime - refactoredTime) / baselineTime;
    expect(improvement).toBeGreaterThan(0.20); // 20% improvement
  });
});
```

## Security Considerations

1. **Path Traversal:** All file paths are resolved to absolute paths and validated against the project root
2. **Worker Script Path:** The worker script path is resolved relative to the plugin's dist directory, not user input
3. **Configuration Injection:** Options are validated and typed before passing to CivetmanCore
4. **Process Isolation:** While we're removing process isolation, the worker pool still provides thread-level isolation for compilation tasks

## Backward Compatibility

### For Plugin Users
- **No breaking changes:** The plugin's public API (CivetmanOptions interface) remains unchanged
- **No configuration changes:** Existing vite.config files work without modification
- **Transparent upgrade:** Users get performance improvements automatically

### For CLI Users
- **No changes:** The CLI (`civetman` command) continues to work independently
- **Separate entry point:** The CLI still uses its own entry point and doesn't depend on the plugin

## Future Enhancements

1. **Monorepo Structure:** Consider moving to a proper monorepo with separate packages (Approach 2 from feedback)
2. **Published Package:** Publish civetman-fork as a standalone npm package (Approach 1 from feedback)
3. **Incremental Type Checking:** Integrate TypeScript type checking into the watch loop
4. **Build Cache:** Implement a persistent build cache across Vite restarts
5. **HMR Integration:** Explore deeper integration with Vite's HMR system for faster updates
