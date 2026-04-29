import js from '@eslint/js';
import globals from 'globals';
import prettierPlugin from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import securityPlugin from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import regexp from 'eslint-plugin-regexp';
import promise from 'eslint-plugin-promise';
import noSecrets from 'eslint-plugin-no-secrets';

// Extraer plugins de configs para evitar redefinición
const { plugins: sonarPlugins, ...sonarRecommendedConfig } = sonarjs.configs.recommended;
const { plugins: regexpPlugins, ...regexpRecommendedConfig } = regexp.configs['flat/recommended'];
const { plugins: promisePlugins, ...promiseRecommendedConfig } = promise.configs['flat/recommended'];

/** @type {import('eslint').Linter.Config[]} */
export default [
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
      '**/*.md',
      '**/README*.md',
      '**/*.json',
      'eslint.config.mjs'
    ]
  },
  js.configs.recommended,
  securityPlugin.configs.recommended,
  {
    ...sonarRecommendedConfig,
    plugins: {
      ...sonarPlugins,
      sonarjs
    }
  },
  {
    ...regexpRecommendedConfig,
    plugins: {
      ...regexpPlugins,
      regexp
    }
  },
  {
    ...promiseRecommendedConfig,
    plugins: {
      ...promisePlugins,
      promise
    }
  },
  eslintConfigPrettier,
  {
    plugins: {
      prettier: prettierPlugin,
      security: securityPlugin,
      'no-secrets': noSecrets
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2024,
        ...globals.jest
      }
    },
    rules: {
      // ==========================================
      // SONARJS — Reglas base (ajustes sobre recommended)
      // ==========================================
      'no-console': 'warn',
      'sonarjs/no-unused-vars': 'warn',
      'sonarjs/cognitive-complexity': ['warn', 50],
      'sonarjs/todo-tag': 'warn',
      'sonarjs/pseudo-random': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/slow-regex': 'warn',
      'sonarjs/no-redundant-assignments': 'warn',
      'sonarjs/no-ignored-exceptions': 'warn',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/anchor-precedence': 'warn',
      'sonarjs/concise-regex': 'warn',
      'sonarjs/no-inverted-boolean-check': 'warn',

      // ==========================================
      // SONARJS — Seguridad (activadas desde "off" en recommended)
      // Mapeo: CWE-327 encryption, CWE-311 cookies, CWE-88 process-argv
      // ==========================================
      'sonarjs/encryption': 'warn',
      'sonarjs/cookies': 'warn',
      'sonarjs/sockets': 'warn',
      'sonarjs/process-argv': 'warn',

      // ==========================================
      // SONARJS — Mantenibilidad (activadas desde "off" en recommended)
      // Mapeo: S1541, S134, S1066, S1488, S2428, S135, S5867
      // ==========================================
      'sonarjs/cyclomatic-complexity': ['warn', { threshold: 25 }],
      'sonarjs/nested-control-flow': ['warn', { maximumNestingLevel: 4 }],
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/prefer-object-literal': 'warn',
      'sonarjs/too-many-break-or-continue-in-loop': 'warn',
      'sonarjs/unicode-aware-regex': 'warn',

      // ==========================================
      // SONARJS — Fiabilidad / detección de bugs
      // Mapeo: S3801, S3402, S1154, S3757, S3758, S3760
      // ==========================================
      'sonarjs/no-inconsistent-returns': 'warn',
      'sonarjs/no-incorrect-string-concat': 'warn',
      'sonarjs/useless-string-operation': 'warn',
      'sonarjs/operation-returning-nan': 'warn',
      'sonarjs/values-not-convertible-to-numbers': 'warn',
      'sonarjs/non-number-in-arithmetic-expression': 'warn',

      // ==========================================
      // SECURITY
      // ==========================================
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'warn',
      'security/detect-non-literal-regexp': 'warn',

      // ==========================================
      // NO-SECRETS — CWE-798 (credenciales hardcodeadas)
      // Complementa sonarjs/no-hardcoded-passwords con detección por entropía
      // ==========================================
      'no-secrets/no-secrets': ['warn', { tolerance: 4.5 }],

      // ==========================================
      // PROMISE — S2966, S4327 (promises sin manejar)
      // Overrides sobre flat/recommended para adaptarse a Express middleware
      // ==========================================
      'promise/always-return': 'warn',
      'promise/catch-or-return': 'warn',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',

      // ==========================================
      // PRETTIER
      // ==========================================
      'prettier/prettier': 'error',

      // ==========================================
      // BUENAS PRÁCTICAS
      // ==========================================
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
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'object-shorthand': ['error', 'always'],
      'no-useless-rename': 'error',
      'no-useless-return': 'error',

      // ==========================================
      // REGEXP — Ajustes sobre flat/recommended
      // Reglas estilísticas como warn (no son bugs, son mejoras de legibilidad)
      // ==========================================
      'regexp/use-ignore-case': 'warn',
      'regexp/prefer-w': 'warn'
    }
  },
  {
    files: ['seeders/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    rules: {
      'no-console': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/pseudo-random': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'sonarjs/no-nested-functions': 'off',
      'no-secrets/no-secrets': 'off',
      'promise/always-return': 'off',
      'promise/catch-or-return': 'off',
      'sonarjs/sockets': 'off'
    }
  }
];
