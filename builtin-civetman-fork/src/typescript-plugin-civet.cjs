// Lightweight CommonJS plugin for TypeScript to handle .civet files
const ts = require('typescript');
const { compile } = require('@danielx/civet');
const { SourceMapConsumer } = require('source-map-js');
const glob = require('fast-glob');
const path = require('path');

function create(info) {
  const host = info.languageServiceHost;
  const service = info.languageService;
  const originalGetScriptSnapshot = host.getScriptSnapshot;
  const maps = {};

  host.getScriptSnapshot = function(fileName) {
    if (fileName.endsWith('.civet')) {
      const text = ts.sys.readFile(fileName, 'utf8') || '';
      const { code, sourceMap } = compile(text, { filename: fileName, sourceMap: true, sync: true });
      maps[fileName] = new SourceMapConsumer(sourceMap.json(fileName, fileName + '.ts'));
      return ts.ScriptSnapshot.fromString(code);
    }
    return originalGetScriptSnapshot.call(host, fileName);
  };

  // Include .civet files in the project via fast-glob
  const originalGetScriptFileNames = host.getScriptFileNames.bind(host);
  host.getScriptFileNames = () => {
    const names = originalGetScriptFileNames();
    const projectDir = host.getCurrentDirectory();
    const civetFiles = glob.sync('**/*.civet', { cwd: projectDir, absolute: true, ignore: ['**/node_modules/**', '**/dist/**'] });
    return Array.from(new Set([...names, ...civetFiles]));
  };

  // Handle module resolution for .civet imports
  const originalResolveModuleNames = host.resolveModuleNames?.bind(host);
  host.resolveModuleNames = (moduleNames, containingFile, reusedNames, redirectedReference, options) =>
    moduleNames.map((moduleName, i) => {
      // Resolve extensionless .civet imports (e.g. import './file')
      if (!moduleName.endsWith('.civet')) {
        const civetName = moduleName + '.civet';
        const civetPath = path.isAbsolute(civetName)
          ? civetName
          : path.join(path.dirname(containingFile), civetName);
        if (ts.sys.fileExists(civetPath)) {
          return { resolvedFileName: civetPath, extension: ts.Extension.Ts };
        }
      }
      // Explicit .civet import
      if (moduleName.endsWith('.civet')) {
        let resolvedFileName = path.isAbsolute(moduleName)
          ? moduleName
          : path.join(path.dirname(containingFile), moduleName);
        if (!resolvedFileName.endsWith('.civet')) resolvedFileName += '.civet';
        if (ts.sys.fileExists(resolvedFileName)) {
          return { resolvedFileName, extension: ts.Extension.Ts };
        }
      }
      // Fallback to original resolver
      if (originalResolveModuleNames) {
        const results = originalResolveModuleNames([moduleName], containingFile, reusedNames, redirectedReference, options);
        return results && results[0];
      }
      return undefined;
    });

  // Remap go-to-definition back to the .civet source
  const originalGetDefs = service.getDefinitionAndBoundSpan;
  service.getDefinitionAndBoundSpan = function(fileName, position) {
    const result = originalGetDefs.call(service, fileName, position);
    if (result && result.definitions) {
      result.definitions.forEach(d => {
        if (d.fileName.endsWith('.civet.ts')) {
          const generated = d.fileName;
          const originalFile = generated.replace(/\.ts$/, '');
          const consumer = maps[originalFile];
          const snapshot = host.getScriptSnapshot(generated);
          if (!consumer || !snapshot) return;

          const sf = ts.createSourceFile(generated, snapshot.getText(0, snapshot.getLength()), ts.ScriptTarget.Latest);
          const { line, character } = ts.getLineAndCharacterOfPosition(sf, d.textSpan.start);
          const origPos = consumer.originalPositionFor({ line: line + 1, column: character });

          if (origPos && origPos.source && origPos.line != null) {
            const origSnapshot = host.getScriptSnapshot(origPos.source);
            if (!origSnapshot) return;

            d.fileName = origPos.source;
            const origSf = ts.createSourceFile(origPos.source, origSnapshot.getText(0, origSnapshot.getLength()), ts.ScriptTarget.Latest);
            const start = ts.getPositionOfLineAndCharacter(origSf, origPos.line - 1, origPos.column || 0);
            d.textSpan = { start, length: d.textSpan.length };
          }
        }
      });
    }
    return result;
  };

  return service;
}

module.exports = { create }; 