# Requirements Document

## Introduction

This document specifies the requirements for refactoring the vite-plugin-civetman-fork architecture to eliminate the inefficient `child_process.fork()` pattern and establish a proper separation of concerns between the Vite plugin and the civetman-fork CLI tool. The current implementation embeds the entire civetman-fork project within the plugin and shells out to it via process forking, which is slow, brittle, and creates tight physical coupling with loose runtime coupling. The refactored architecture will expose civetman-fork's core compilation and watching logic as a programmatic API that the Vite plugin can call directly in-process.

## Glossary

- **VitePlugin**: The vite-plugin-civetman-fork package that integrates Civet compilation into Vite's build pipeline
- **CivetmanCore**: The civetman-fork CLI tool and its core compilation/watching functionality
- **BuildOrchestrator**: The core function in CivetmanCore that coordinates parallel compilation of Civet files
- **WatchManager**: The core function in CivetmanCore that manages file watching and incremental compilation
- **ProcessFork**: The current pattern of using Node.js `child_process.fork()` to run CivetmanCore in a separate process
- **InProcessAPI**: The new pattern where VitePlugin calls CivetmanCore functions directly within the same Node.js process
- **WorkerPool**: The thread pool used by CivetmanCore for parallel compilation tasks

## Requirements

### Requirement 1

**User Story:** As a developer using the Vite plugin, I want the build process to be fast and reliable, so that my development workflow is not slowed down by inefficient inter-process communication

#### Acceptance Criteria

1. WHEN THE VitePlugin initiates a build, THE BuildOrchestrator SHALL execute within the same Node.js process as the VitePlugin
2. WHEN THE VitePlugin initiates a build, THE VitePlugin SHALL NOT use ProcessFork to communicate with CivetmanCore
3. WHEN THE BuildOrchestrator completes compilation, THE VitePlugin SHALL receive results through direct function return values
4. THE BuildOrchestrator SHALL complete compilation at least 20% faster than the ProcessFork implementation for projects with 10 or more Civet files

### Requirement 2

**User Story:** As a developer maintaining the codebase, I want clear separation between the Vite plugin and the core compilation logic, so that each component can be developed, tested, and versioned independently

#### Acceptance Criteria

1. THE VitePlugin SHALL import functions directly from CivetmanCore modules without intermediate API layers
2. THE CivetmanCore functions SHALL accept configuration objects as parameters
3. THE CivetmanCore functions SHALL return typed results or throw typed errors
4. THE VitePlugin SHALL import from orchestrator, watcher, state, and integrations modules through standard ES module imports
5. THE CivetmanCore SHALL NOT depend on VitePlugin code or types

### Requirement 3

**User Story:** As a developer using the Vite dev server, I want file watching to be integrated with Vite's watcher, so that I don't have redundant file system watchers consuming resources

#### Acceptance Criteria

1. WHEN THE VitePlugin runs in development mode, THE VitePlugin SHALL use Vite's existing file watcher instance
2. WHEN a Civet file changes, THE VitePlugin SHALL trigger recompilation through direct BuildEngine calls
3. THE VitePlugin SHALL NOT create a separate chokidar watcher instance in development mode
4. WHEN THE VitePlugin development server stops, THE VitePlugin SHALL clean up all watch handlers and terminate the WorkerPool

### Requirement 4

**User Story:** As a developer, I want the refactored architecture to maintain backward compatibility with existing plugin options, so that I don't need to change my configuration

#### Acceptance Criteria

1. THE VitePlugin SHALL accept the same CivetmanOptions interface as the current implementation
2. THE VitePlugin SHALL translate CivetmanOptions into the format required by the CivetmanCore API
3. WHEN a user provides plugin options, THE VitePlugin SHALL pass equivalent configuration to BuildOrchestrator and WatchManager
4. THE VitePlugin SHALL support all existing options including tsx, gitIgnore, vscodeHide, inlineMap, mapFiles, outTs, outTsx, concurrency, forcePolling, ignoreFolders, onlyFolders, and force

### Requirement 5

**User Story:** As a developer, I want proper error handling and reporting, so that I can quickly diagnose and fix issues during compilation

#### Acceptance Criteria

1. WHEN THE BuildOrchestrator encounters a compilation error, THE BuildOrchestrator SHALL throw a typed error with file path and error details
2. WHEN THE VitePlugin receives a compilation error, THE VitePlugin SHALL propagate the error to Vite's error handling system
3. WHEN THE WatchManager encounters an error during file watching, THE WatchManager SHALL log the error and continue watching other files
4. THE BuildOrchestrator SHALL include a timeout mechanism that fails gracefully if compilation hangs
5. WHEN THE BuildOrchestrator times out, THE VitePlugin SHALL receive a clear timeout error message

### Requirement 6

**User Story:** As a developer building the plugin itself, I want to avoid circular dependencies, so that the build process is reliable and maintainable

#### Acceptance Criteria

1. WHEN THE VitePlugin detects it is building CivetmanCore itself, THE VitePlugin SHALL skip calling BuildOrchestrator
2. WHEN building CivetmanCore, THE VitePlugin SHALL only perform inline Civet-to-TypeScript transformation
3. THE VitePlugin SHALL detect circular builds by checking if the current working directory contains "builtin-civetman-fork"
4. THE build detection logic SHALL work correctly regardless of the directory structure

### Requirement 7

**User Story:** As a developer, I want the WorkerPool to be properly managed, so that compilation resources are efficiently utilized and cleaned up

#### Acceptance Criteria

1. WHEN THE BuildOrchestrator starts, THE BuildOrchestrator SHALL initialize the WorkerPool with the configured concurrency level
2. WHEN THE BuildOrchestrator completes, THE BuildOrchestrator SHALL terminate all workers in the WorkerPool
3. THE BuildOrchestrator SHALL reuse the WorkerPool across multiple compilation requests within the same process
4. WHEN THE VitePlugin process exits, THE WorkerPool SHALL terminate all worker threads within 1 second

### Requirement 8

**User Story:** As a developer, I want the refactored code to be well-tested, so that I can trust the implementation is correct

#### Acceptance Criteria

1. THE CivetmanCore public API module SHALL have unit tests covering all exported functions
2. THE VitePlugin integration with the InProcessAPI SHALL have integration tests
3. THE tests SHALL verify that ProcessFork is not used in the refactored implementation
4. THE tests SHALL verify that compilation performance meets the 20% improvement requirement
5. THE tests SHALL verify proper error handling and timeout behavior
