"use strict";
const node_worker_threads = require("node:worker_threads");
const civet = require("@danielx/civet");
const fs = require("node:fs/promises");
if (!node_worker_threads.parentPort) {
  throw new Error("Must be run as a worker thread.");
}
node_worker_threads.parentPort.on("message", async (msg) => {
  const { file, content: initialContent, isTsx, wantMap, parseOpts } = msg;
  try {
    const content = initialContent != null ? initialContent : await fs.readFile(file, "utf8");
    const compileOptions = {
      filename: file,
      sourceMap: wantMap,
      ...(parseOpts ? { parseOptions: parseOpts } : {})
    };
    const rawResult = await civet.compile(content, compileOptions);
    const result = typeof rawResult === 'string' ? { code: rawResult } : rawResult;
    const { code, sourceMap } = result;
    const outFile = file.replace(".civet", isTsx ? ".tsx" : ".ts");
    const mapJson = wantMap && sourceMap ? sourceMap.json(file, outFile) : null;
    return node_worker_threads.parentPort.postMessage({ ok: true, code, mapJson });
  } catch (error) {
    return node_worker_threads.parentPort.postMessage({ ok: false, error: String(error) });
  }
});
