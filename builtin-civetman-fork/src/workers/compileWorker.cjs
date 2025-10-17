"use strict";
const node_worker_threads = require("node:worker_threads");
const civet = require("@danielx/civet");
const fs = require("node:fs/promises");
const pp = node_worker_threads.parentPort;
if (!pp) {
  throw new Error("Must be run as a worker thread.");
}
pp.on("message", async (msg) => {
  const { file, content: initial, isTsx, wantMap, parseOpts } = msg;
  try {
    let ref;
    if (initial != null) {
      ref = initial;
    } else ref = await fs.readFile(file, "utf8");
    const content = ref;
    const compileOptions = { filename: file, ...wantMap ? { sourceMap: true } : {}, ...parseOpts ? { parseOptions: parseOpts } : {} };
    const rawResult = await civet.compile(content, compileOptions);
    const result = typeof rawResult === "string" ? { code: rawResult } : rawResult;
    const { code, sourceMap } = result;
    const outFile = file.replace(".civet", isTsx ? ".tsx" : ".ts");
    let ref1;
    if (wantMap && sourceMap) {
      ref1 = sourceMap.json(file, outFile);
    } else ref1 = null;
    const mapJson = ref1;
    const successResult = { ok: true, code, mapJson };
    return pp.postMessage(successResult);
  } catch (error) {
    const errorResult = { ok: false, error: String(error) };
    return pp.postMessage(errorResult);
  }
});
