const js = require('@eslint/js');
const globals = require('globals');
const prettierPlugin = require('eslint-plugin-prettier');
const eslintConfigPrettier = require('eslint-config-prettier');
const securityPlugin = require('eslint-plugin-security');
const sonarjs = require('eslint-plugin-sonarjs');

// Extract plugins from sonarjs config to avoid redefinition issues
const { plugins: sonarPlugins, ...sonarRecommendedConfig } = sonarjs.configs.recommended;

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
      '*.md',
      '**/README*.md',
      '**/*.json'
    ]
  },
  js.configs.recommended,
  securityPlugin.configs.recommended, // Reglas de seguridad
  {
    ...sonarRecommendedConfig,
    plugins: {
      ...sonarPlugins,
      sonarjs // Explicitly use the required instance to ensure reference consistency
    }
  },
  eslintConfigPrettier,
  {
    plugins: {
      prettier: prettierPlugin,
      security: securityPlugin
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2024,
        ...globals.jest // Correctly expand jest globals (describe, it, expect, etc.)
      }
    },
    rules: {
      'no-console': 'warn', // En producción mejor usar logger, pero warn es suficiente
      // 'no-unused-vars': 'warn', // Facilitar el desarrollo (REMOVED: Duplicate)
      'sonarjs/no-unused-vars': 'warn', // Evitar bloqueo por variables no usadas temporalmente
      'sonarjs/cognitive-complexity': ['warn', 50], // Relajamos la complejidad para permitir lógica de juego
      'sonarjs/todo-tag': 'warn', // Los TODOs son parte del proceso, no errores
      'sonarjs/pseudo-random': 'warn', // Permitir Math.random para mecánicas de juego que no requieren criptografía
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/no-duplicate-string': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'warn', // Alertar pero no bloquear
      'sonarjs/slow-regex': 'warn',
      'sonarjs/no-redundant-assignments': 'warn',
      'sonarjs/no-ignored-exceptions': 'warn',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/anchor-precedence': 'warn',
      'sonarjs/concise-regex': 'warn',
      // Enable prettier formatting as a rule
      'prettier/prettier': 'error',

      // Best Practices & Improvements
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],
      'no-duplicate-imports': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-async-promise-executor': 'error',

      // Modern JS Improvements
      'object-shorthand': ['error', 'always'],
      'no-useless-rename': 'error',
      'no-useless-return': 'error'
    }
  },
  {
    files: ['seeders/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    rules: {
      'no-console': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/pseudo-random': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'sonarjs/no-nested-functions': 'off'
    }
  }
];
