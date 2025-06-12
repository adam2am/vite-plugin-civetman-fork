import type { SourceMap as CivetSourceMapClass } from '@danielx/civet';
import type { CivetCompileResult, CivetOutputMap, StandardRawSourceMap, CivetLinesSourceMap } from './civetTypes';

const civetCompilerDebug = false;

// Dynamically load the Civet compiler to make it optional
let _civetModule: typeof import('@danielx/civet') | null | undefined;
function getCivetModule(): typeof import('@danielx/civet') | null {
  if (_civetModule !== undefined) return _civetModule;
  try {
    // Use require to allow optional dependency
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _civetModule = require('@danielx/civet');
  } catch (e) {
    console.warn('[compileCivet] @danielx/civet not found, skipping Civet compilation');
    _civetModule = null;
  }
  return _civetModule;
}

/**
 * Compile a Civet snippet into TypeScript code and a raw sourcemap.
 */
export function compileCivet(
  snippet: string,
  filename: string,
  options?: { outputStandardV3Map?: boolean }
): CivetCompileResult {
  const civet = getCivetModule();
  if (!civet) {
    // No Civet compiler available, return original code and no map
    return { code: snippet, rawMap: undefined };
  }
  if (civetCompilerDebug) {
    console.log(`[compileCivet-debug] Compiling Civet snippet for file: ${filename}`);
    console.log(`[compileCivet-debug] Snippet content:\n${snippet}`);
  }
  const compileOpts = {
    js: false,
    sourceMap: true,
    inlineMap: false,
    filename,
    sync: true
  };

  // Cast through unknown to bypass complex conditional type inference issues for civet.compile
  const civetResult = (civet.compile as any)(snippet, compileOpts) as { code: string; sourceMap: CivetSourceMapClass };
  if (civetCompilerDebug) {
    console.log(`[compileCivet-debug] Civet.compile returned code length: ${civetResult.code.length}`);
    console.log(`[compileCivet-debug] Civet.compile code snippet prefix: ${civetResult.code.slice(0, 100).replace(/\n/g, '\\n')}...`);
  }

  let finalMap: CivetOutputMap | undefined = undefined;

  if (civetResult.sourceMap) {
    if (options?.outputStandardV3Map === true) {
      finalMap = civetResult.sourceMap.json(filename, filename) as StandardRawSourceMap;
    } else {
      finalMap = civetResult.sourceMap as unknown as CivetLinesSourceMap;
    }
    if (civetCompilerDebug) console.log(`[compileCivet-debug] rawMap type: ${finalMap && 'lines' in finalMap ? 'CivetLinesSourceMap' : 'StandardRawSourceMap'}`);
  }

  return {
    code: civetResult.code,
    rawMap: finalMap
  };
} 