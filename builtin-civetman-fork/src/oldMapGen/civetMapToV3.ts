import { GenMapping, setSourceContent, addMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import type { EncodedSourceMap } from '@jridgewell/gen-mapping';
import type { CivetLinesSourceMap } from './civetTypes.ts';
import * as ts from 'typescript';
// avoid unused-import linter errors
if (ts) { /* noop */ }

/**
 * Normalize a Civet-specific sourcemap (CivetLinesSourceMap, from Civet snippet -> TS snippet)
 * to be a standard V3 RawSourceMap from Original Svelte File -> TS snippet.
 *
 * @param civetMap The CivetLinesSourceMap containing the `lines` array from `civet.compile()`.
 * @param originalFullSvelteContent The full content of the original .svelte file.
 * @param originalContentStartLine_1based 1-based Svelte line where snippet starts
 * @param removedIndentLength number of spaces stripped from snippet indent
 * @param svelteFilePath The actual file path of the .svelte file (for the output sourcemap's `sources` and `file` fields).
 * @param compiledTsCode optional TS snippet for AST-based enhancements
 * @returns A Standard V3 RawSourceMap that maps from the original .svelte file to the compiled TS snippet.
 */
export function normalizeCivetMap(
  civetMap: CivetLinesSourceMap,
  originalFullSvelteContent: string,
  originalContentStartLine_1based: number, // 1-based Svelte line where snippet starts
  removedIndentLength: number,           // number of spaces stripped from snippet indent
  svelteFilePath: string,
  compiledTsCode?: string                // optional TS snippet for AST-based enhancements
): EncodedSourceMap {
  console.log(`[MAP_TO_V3 ${svelteFilePath}] Normalizing Civet map. Snippet line offset in Svelte (0-based): ${originalContentStartLine_1based - 1}`);
  // avoid unused param linter error; compiledTsCode used later for AST enhancements
  if (compiledTsCode) { /* noop */ }
  // AST-based loop-variable caching
  let tsIdentifierLengths: Map<string, number> | null = null;
  const protectedForVars: Array<{ line: number; start: number; end: number }> = [];
  // AST-based positions for user loop variables and iterables (fallback injection)
  const astLoopPositions: Array<{ name: string; line: number; start: number; end: number }> = [];
  const indexVarNames = new Set<string>();

  // Parse TS AST for identifier lengths if compiledTsCode is available
  // PERF_GUARD: Only parse AST if for loops are present, as that's all we use it for.
  if (compiledTsCode && /for\s*\(/.test(compiledTsCode)) {
    console.log(`[MAP_TO_V3_PERF ${svelteFilePath}] Found for-loop pattern, engaging AST parser.`);
    try {
      tsIdentifierLengths = new Map<string, number>();
      const sourceFile = ts.createSourceFile(
        `${svelteFilePath}-snippet.ts`,
        compiledTsCode,
        ts.ScriptTarget.ESNext,
        true
      );

      function visit(node: ts.Node) {
        if (ts.isIdentifier(node)) {
          const name = node.text;
          tsIdentifierLengths!.set(name, name.length);
          
          // Protect compiler-generated index variables (i, i0, i1, etc.)
          if (/^i\d*$/.test(name)) {
            indexVarNames.add(name);
            const startOffset = node.getStart(sourceFile, false);
            const endOffset = node.getEnd();
            const posStart = sourceFile.getLineAndCharacterOfPosition(startOffset);
            const posEnd = sourceFile.getLineAndCharacterOfPosition(endOffset);
            // Re-add protected range for compiler-generated index variable
            protectedForVars.push({ line: posStart.line, start: posStart.character, end: posEnd.character });
          }
        }
        // Protect user-declared loop variables and iterable names
        if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
          const loopNode = node as ts.ForOfStatement | ts.ForInStatement;
          // Variable declarations (e.g. 'const itemsss', 'const fruit1', 'const fruit', 'const fruit23')
          const init = loopNode.initializer;
          if (ts.isVariableDeclarationList(init)) {
            init.declarations.forEach(decl => {
              if (ts.isIdentifier(decl.name)) {
                const start = decl.name.getStart(sourceFile, false);
                const end = decl.name.getEnd();
                const pStart = sourceFile.getLineAndCharacterOfPosition(start);
                const pEnd = sourceFile.getLineAndCharacterOfPosition(end);
                protectedForVars.push({ line: pStart.line, start: pStart.character, end: pEnd.character });
                astLoopPositions.push({ name: decl.name.text, line: pStart.line, start: pStart.character, end: pEnd.character });
                console.log(`[CIVET_LOG_AST_PROTECT] protecting loop var '${decl.name.text}' TS(${pStart.line+1}:${pStart.character}-${pEnd.character})`);
              }
            });
          }
          // Iterable identifier for all loop types
          const expr = loopNode.expression;
          if (ts.isIdentifier(expr)) {
            const start = expr.getStart(sourceFile, false);
            const end = expr.getEnd();
            const pStart = sourceFile.getLineAndCharacterOfPosition(start);
            const pEnd = sourceFile.getLineAndCharacterOfPosition(end);
            protectedForVars.push({ line: pStart.line, start: pStart.character, end: pEnd.character });
            astLoopPositions.push({ name: expr.text, line: pStart.line, start: pStart.character, end: pEnd.character });
            console.log(`[REF7_AST_ITERABLE] protecting iterable '${expr.text}' TS(${pStart.line+1}:${pStart.character}-${pEnd.character})`);
          }

          // Check for variable declarations inside the loop body (for for..in index)
          const body = loopNode.statement;
          if (ts.isBlock(body)) {
            body.statements.forEach(stmt => {
              if (ts.isVariableStatement(stmt)) {
                stmt.declarationList.declarations.forEach(decl => {
                  if (ts.isIdentifier(decl.name)) {
                    const start = decl.name.getStart(sourceFile, false);
                    const end = decl.name.getEnd();
                    const pStart = sourceFile.getLineAndCharacterOfPosition(start);
                    const pEnd = sourceFile.getLineAndCharacterOfPosition(end);
                    protectedForVars.push({ line: pStart.line, start: pStart.character, end: pEnd.character });
                    astLoopPositions.push({ name: decl.name.text, line: pStart.line, start: pStart.character, end: pEnd.character });
                    console.log(`[CIVET_LOG_AST_PROTECT] protecting inner loop var '${decl.name.text}' TS(${pStart.line+1}:${pStart.character}-${pEnd.character})`);
                  }
                });
              }
            });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } catch (e) {
      console.error(`[MAP_TO_V3 ${svelteFilePath}] Error parsing compiled TS for AST: ${(e as Error).message}`);
      tsIdentifierLengths = null;
    }
  } else if (compiledTsCode) {
    console.log(`[MAP_TO_V3_PERF ${svelteFilePath}] No for-loop pattern found, skipping AST parser.`);
  }

  // Consolidate overlapping protected ranges
  const consolidatedRanges = new Map<number, { start: number; end: number }[]>();
  protectedForVars.forEach(range => {
    if (!consolidatedRanges.has(range.line)) {
      consolidatedRanges.set(range.line, []);
    }
    const lineRanges = consolidatedRanges.get(range.line)!;
    let merged = false;
    for (const existing of lineRanges) {
      if (range.start <= existing.end && existing.start <= range.end) {
        existing.start = Math.min(existing.start, range.start);
        existing.end = Math.max(existing.end, range.end);
        merged = true;
        break;
      }
    }
    if (!merged) {
      lineRanges.push({ start: range.start, end: range.end });
    }
  });

  // Detailed debug for our failing fixture
  if (svelteFilePath.includes('twoFooUserRequest.svelte')) {
    // Log the raw Civet snippet source
    console.log(`[MAP_TO_V3_DEBUG] Civet snippet source for ${svelteFilePath}:\n${civetMap.source}`);
    // Log the raw mapping lines
    console.log(`[MAP_TO_V3_DEBUG] Civet raw lines for ${svelteFilePath}: ${JSON.stringify(civetMap.lines)}`);
    // Log the corresponding Svelte file lines where the snippet resides
    const tmpSvelteLines = originalFullSvelteContent.split('\n');
    console.log(`[MAP_TO_V3_DEBUG] Svelte snippet lines (line ${originalContentStartLine_1based} to ${originalContentStartLine_1based + civetMap.lines.length - 1}):`);
    for (let i = originalContentStartLine_1based - 1; i < originalContentStartLine_1based + civetMap.lines.length - 1; i++) {
      console.log(`  [Svelte L${i+1}] ${tmpSvelteLines[i]}`);
    }
  }

  const gen = new GenMapping({ file: svelteFilePath });

  // Set the source content for the .svelte file.
  // This ensures the output map refers to the full original Svelte content.
  setSourceContent(gen, svelteFilePath, originalFullSvelteContent);

  const svelteLines = originalFullSvelteContent.split('\n');

  // The `civetMap.lines` array contains segments which are:
  // [generatedColumn_0based, sourceFileIndex_0based, originalLine_0based_in_snippet, originalColumn_0based_in_snippet, optional_nameIndex_0based]

  if (civetMap.lines) {
    civetMap.lines.forEach((lineSegments, tsLineIdx_0based) => {
      // Use a mutable copy for processing
      let segments = lineSegments;
      // REF7: skip raw mapping for TS lines handled by AST-first pass but preserve first segment
      if (astLoopPositions.some(pos => pos.line === tsLineIdx_0based)) {
        console.log(`[REF7_SKIP_RAW ${svelteFilePath}] Skipping raw mapping for TS line ${tsLineIdx_0based+1}, preserving first segment`);
        if (!segments || segments.length === 0) return;
        // Preserve only the initial mapping segment for boundary detection
        segments = [segments[0]];
      }
      if (!segments || segments.length === 0) return;

      let pendingMapping: {
        generatedLine_1based: number;
        generatedColumn_0based: number;
        originalLine_1based: number;
        originalColumn_0based: number;
        name?: string;
      } | null = null;
      
      let currentCivetSegmentGeneratedColumnPointer_0based = 0; // Tracks the absolute start column in TS for the current civet segment

      for (const civetSeg of segments) {
        if (!civetSeg || civetSeg.length === 0) continue;

        const civetGenColDelta = civetSeg[0];
        const tsColForCurrentCivetSeg_0based = currentCivetSegmentGeneratedColumnPointer_0based + civetGenColDelta;
        const currentSegmentIsActualMapping = civetSeg.length >= 4;

        // Skip mapping if in protected range
        const isProtected = consolidatedRanges.get(tsLineIdx_0based)?.some(r =>
          // Skip only columns strictly inside the protected range, allow at the first char
          tsColForCurrentCivetSeg_0based > r.start && tsColForCurrentCivetSeg_0based < r.end
        );
        if (isProtected) {
          currentCivetSegmentGeneratedColumnPointer_0based = tsColForCurrentCivetSeg_0based;
          continue;
        }

        // Flush pendingMapping for multi-character skips
        if (pendingMapping && civetSeg.length === 1 && civetGenColDelta > 1) {
          const endGeneratedColumn = tsColForCurrentCivetSeg_0based;
          const endOriginalColumn = pendingMapping.originalColumn_0based + civetGenColDelta;
            addMapping(gen, {
              source: svelteFilePath,
              generated: { line: pendingMapping.generatedLine_1based, column: endGeneratedColumn },
              original: { line: pendingMapping.originalLine_1based, column: endOriginalColumn },
              name: pendingMapping.name
            });
        }

        // Flush pendingMapping on new mapping at a different column
        if (pendingMapping && tsColForCurrentCivetSeg_0based !== pendingMapping.generatedColumn_0based && currentSegmentIsActualMapping) {
            addMapping(gen, {
              source: svelteFilePath,
              generated: { line: pendingMapping.generatedLine_1based, column: pendingMapping.generatedColumn_0based },
              original: { line: pendingMapping.originalLine_1based, column: pendingMapping.originalColumn_0based },
              name: pendingMapping.name
            });
          pendingMapping = null;
        }
        
        currentCivetSegmentGeneratedColumnPointer_0based = tsColForCurrentCivetSeg_0based;

        if (currentSegmentIsActualMapping) {
          const snippetOrigLine_0based = civetSeg[2];
          const snippetOrigCol_0based = civetSeg[3];
          const currentOriginalLine_1based = originalContentStartLine_1based + snippetOrigLine_0based;

          const origLineIndex = currentOriginalLine_1based - 1;
          const origLineText = svelteLines[origLineIndex] || '';
          let adjustedSnippetCol = snippetOrigCol_0based;
          const realColInSvelte = adjustedSnippetCol + removedIndentLength;
          
          // Adjust for comma + space edge-case
          if (realColInSvelte > 0 && origLineText[realColInSvelte - 1] === ',' && origLineText[realColInSvelte] === ' ') {
            adjustedSnippetCol--;
          }
          
          const currentOriginalCol_0based = adjustedSnippetCol + removedIndentLength;
          const currentName = civetSeg.length >= 5 && civetMap.names ? civetMap.names[civetSeg[4]] : undefined;

          // Skip if name is a protected index variable
          if (currentName && indexVarNames.has(currentName)) {
            continue;
          }

          if (!pendingMapping) {
            pendingMapping = {
              generatedLine_1based: tsLineIdx_0based + 1,
              generatedColumn_0based: tsColForCurrentCivetSeg_0based,
              originalLine_1based: currentOriginalLine_1based,
              originalColumn_0based: currentOriginalCol_0based,
              name: currentName
            };
          } else {
            let newMappingIsPreferred = false;

            const newSvelteChar = (svelteLines[currentOriginalLine_1based - 1] || '')[currentOriginalCol_0based];
            const pendingSvelteChar = (svelteLines[pendingMapping.originalLine_1based - 1] || '')[pendingMapping.originalColumn_0based];
            const newIsWhitespace = newSvelteChar && /\s/.test(newSvelteChar);
            const pendingIsWhitespace = pendingSvelteChar && /\s/.test(pendingSvelteChar);

            if (pendingIsWhitespace && !newIsWhitespace) {
              // Pending is whitespace, new is not. Prefer new.
              newMappingIsPreferred = true;
            } else if (!pendingIsWhitespace && newIsWhitespace) {
              // Pending is not whitespace, new is. Keep pending.
              newMappingIsPreferred = false;
            } else if (currentOriginalLine_1based === pendingMapping.originalLine_1based) {
              // Both are whitespace or both are not.
              // On the same line, prefer smaller column.
              if (currentOriginalCol_0based < pendingMapping.originalColumn_0based) {
                    newMappingIsPreferred = true;
              } else if (currentOriginalCol_0based === pendingMapping.originalColumn_0based && currentName && !pendingMapping.name) {
                // Same location, prefer mapping with a name.
                newMappingIsPreferred = true;
            }
            } else if (currentOriginalLine_1based < pendingMapping.originalLine_1based) {
              // Different lines, prefer the one from an earlier line.
              newMappingIsPreferred = true;
            }

            if (newMappingIsPreferred) {
              pendingMapping.originalLine_1based = currentOriginalLine_1based;
              pendingMapping.originalColumn_0based = currentOriginalCol_0based;
              pendingMapping.name = currentName;
            }
          }
        }
      }

      // End-of-line pending mapping flush
      if (pendingMapping) {
          addMapping(gen, {
            source: svelteFilePath,
            generated: { line: pendingMapping.generatedLine_1based, column: pendingMapping.generatedColumn_0based },
            original: { line: pendingMapping.originalLine_1based, column: pendingMapping.originalColumn_0based },
            name: pendingMapping.name
          });
      }
    });
  }

  // ********** REF7: AST-first injection for for-loop variables **********
  console.log(`[REF7_INIT ${svelteFilePath}] AST-first mapping for ${astLoopPositions.length} loop variables`);
  astLoopPositions.forEach(({ name, line: tsLine0, start: tsStart, end: tsEnd }) => {
    if (indexVarNames.has(name)) {
      console.log(`[REF7_SKIP ${svelteFilePath}] Skipping compiler-generated var '${name}'`);
      return;
    }

    // Find the Svelte line corresponding to this TS line.
    // We use the first segment of the raw map for this TS line just to get the original line index.
    const rawSegs = civetMap.lines[tsLine0] || [];
    if (rawSegs.length === 0 || rawSegs[0].length < 4) {
      console.warn(`[REF7_WARN ${svelteFilePath}] No raw segments found for TS line ${tsLine0 + 1} to determine Svelte line for var '${name}'`);
      return;
    }
    const snippetLineIdx = rawSegs[0][2];
    const origLine = originalContentStartLine_1based + snippetLineIdx;
    const svelteLineText = svelteLines[origLine - 1] || '';

    // Find the variable's column in the original Svelte line using a whole-word regex
    const match = new RegExp(`\\b${name}\\b`).exec(svelteLineText);
    if (!match) {
      console.warn(`[REF7_WARN ${svelteFilePath}] Could not find a whole-word match for '${name}' in Svelte line ${origLine}`);
      return;
    }
    const origColStart = match.index;
    const origColEnd = origColStart + name.length;
    const genLine = tsLine0 + 1;

    // Add direct mapping from TS AST position to Svelte string position
    console.log(`[REF7_VAR ${svelteFilePath}] '${name}' START TS(${genLine}:${tsStart}) -> Svelte(${origLine}:${origColStart})`);
    addMapping(gen, { source: svelteFilePath, generated: { line: genLine, column: tsStart }, original: { line: origLine, column: origColStart }, name });
    console.log(`[REF7_VAR ${svelteFilePath}] '${name}' END   TS(${genLine}:${tsEnd}) -> Svelte(${origLine}:${origColEnd})`);
    addMapping(gen, { source: svelteFilePath, generated: { line: genLine, column: tsEnd }, original: { line: origLine, column: origColEnd }, name });
  });
  // ********** End REF7 **********
  const outputMap = toEncodedMap(gen);
  outputMap.sources = [svelteFilePath];
  outputMap.sourcesContent = [originalFullSvelteContent];
  return outputMap;
}
