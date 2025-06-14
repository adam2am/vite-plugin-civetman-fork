import { defineConfig } from 'vitest/config'
import { compile } from '@danielx/civet'

const civetPlugin = () => ({
  name: 'vitest-plugin-civet',
  async transform(code: string, id: string) {
    if (id.endsWith('.civet')) {
      const { code: jsCode, sourceMap } = await compile(code, { 
        filename: id, 
        sourceMap: true 
      }) as { code: string, sourceMap: any }
      
      return {
        code: jsCode,
        map: sourceMap?.json()
      }
    }
  }
})

export default defineConfig({
  plugins: [civetPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['builtin-civetman-fork/tests/**/*.civet'],
    exclude: ['builtin-civetman-fork/tests/fixture/**'],
  },
  resolve: {
    extensions: ['.civet', '.ts', '.js']
  }
})