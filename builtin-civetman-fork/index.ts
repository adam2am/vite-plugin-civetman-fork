
import main from "./src/cli/index"
import { rewriteCivetImports } from "./src/support/import-rewriter"

// Export the rewriter function for testing
export { rewriteCivetImports }

main()

