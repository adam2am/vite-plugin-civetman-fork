"use strict";
const node_worker_threads = require("node:worker_threads");
const civet = require("@danielx/civet");
const fs = require("node:fs/promises");
if (!node_worker_threads.parentPort) {
  throw new Error("Must be run as a worker thread.");
}
node_worker_threads.parentPort.on("message", async (msg) => {
  const { file, content, isTsx } = msg;
  try {
    if (!(content != null)) {
      const content2 = await fs.readFile(file, "utf8");
    }
    const { code, sourceMap } = await civet.compile(content, { filename: file, sourceMap: true });
    const outFile = file.replace(".civet", isTsx ? ".tsx" : ".ts");
    const mapJson = sourceMap.json(file, outFile);
    const plainMap = JSON.parse(JSON.stringify(mapJson));
    return node_worker_threads.parentPort.postMessage({ ok: true, code, mapJson: plainMap });
  } catch (error) {
    return node_worker_threads.parentPort.postMessage({ ok: false, error: String(error) });
  }
});
