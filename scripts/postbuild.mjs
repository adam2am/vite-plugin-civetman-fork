#!/usr/bin/env node
import fs from 'fs-extra'
import path from 'node:path'

const root = process.cwd()
const distCliDir = path.join(root, 'dist', 'cli')
const builtinDistDir = path.join(root, 'builtin-civetman-fork', 'dist')

async function main() {
  await fs.ensureDir(distCliDir)

  // Copy CLI index (prefer CJS for node bin)
  const srcIndexJs = path.join(builtinDistDir, 'index.js')
  const destIndexJs = path.join(distCliDir, 'index.js')
  if (await fs.pathExists(srcIndexJs)) {
    await fs.copy(srcIndexJs, destIndexJs)
  }

  // Copy workers folder
  const srcWorkers = path.join(builtinDistDir, 'workers')
  const destWorkers = path.join(distCliDir, 'workers')
  if (await fs.pathExists(srcWorkers)) {
    await fs.ensureDir(destWorkers)
    await fs.copy(srcWorkers, destWorkers)
  }
}

main().catch((err) => {
  console.error('[postbuild] failed:', err)
  process.exit(1)
})


