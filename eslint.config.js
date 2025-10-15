import civetPlugin from 'eslint-plugin-civet/ts'

export default [
  // Rules from eslint.configs.recommended
  ...civetPlugin.configs.jsRecommended,
  // Rules from tseslint.configs.strict
  ...civetPlugin.configs.strict,
  {
    languageOptions: {
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      // Relax some strict rules for this project
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Allow require() in .cjs files
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-dynamic-delete': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'builtin-civetman-fork/dist/**',
      'builtin-civetman-fork/node_modules/**',
      'builtin-civetman-fork/cli/dist/**',
      'builtin-civetman-fork/src/**/*.ts', // Ignore generated .ts shadow files
      '**/*.civetmantmp', // Ignore temporary files
    ],
  },
]
