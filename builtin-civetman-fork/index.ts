#!/usr/bin/env node
import main from "./src/cli/index.civet"
import { rewriteCivetImports } from "./src/support/import-rewriter.civet"

// Export the rewriter function for testing
export { rewriteCivetImports }

main()
