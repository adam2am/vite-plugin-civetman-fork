import { rewriteCivetImports } from '../src/import-rewriter.civet';

const testCode = `import { foo } from "./bar.civet"
import type { Baz } from "./types.civet"
import { external } from "some-package"

export const test = "hello"`;

console.log('Original code:');
console.log(testCode);
console.log('\nRewritten code:');
console.log(rewriteCivetImports(testCode));
