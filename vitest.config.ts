import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['builtin-civetman-fork/tests/**/*.ts'],
    exclude: ['builtin-civetman-fork/tests/fixture/**'],
    testTimeout: 15000, // Increase global timeout for slow CI
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
})