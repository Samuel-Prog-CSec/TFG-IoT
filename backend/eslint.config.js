const js = require('@eslint/js');
const globals = require('globals');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '.env',
      '.env.*',
      '**/*.log',
      'docs/',
      'reports/',
      'logs/',
      'tests/',
      '**/*.md',
      '**/*.json',
      'scripts/'
    ]
  },
  js.configs.recommended,
  {
    plugins: {
      prettier: prettierPlugin
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      // Merge prettier rules (disabling conflicting ones)
      ...prettierConfig.rules,
      
      // Enable prettier formatting as a rule
      'prettier/prettier': 'error',
      
      // Best Practices & Improvements
      'no-console': 'off', // Backend logging
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],
      'no-duplicate-imports': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-async-promise-executor': 'error',
      
      // Modern JS Improvements
      'object-shorthand': ['error', 'always'],
      'no-useless-rename': 'error',
      'no-useless-return': 'error'
    }
  }
];
