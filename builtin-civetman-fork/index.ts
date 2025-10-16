#!/usr/bin/env node
import main, { rewriteCivetImports } from "./src/main"

// Export the rewriter function for testing
export { rewriteCivetImports }

main()
