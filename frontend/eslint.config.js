import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import sonarjs from 'eslint-plugin-sonarjs'
import securityPlugin from 'eslint-plugin-security'
import regexp from 'eslint-plugin-regexp'
import promise from 'eslint-plugin-promise'
import noSecrets from 'eslint-plugin-no-secrets'
import { defineConfig, globalIgnores } from 'eslint/config'

// Extraer plugins de configs para evitar redefinición
const { plugins: sonarPlugins, ...sonarRecommendedConfig } = sonarjs.configs.recommended
const { plugins: regexpPlugins, ...regexpRecommendedConfig } = regexp.configs['flat/recommended']
const { plugins: promisePlugins, ...promiseRecommendedConfig } = promise.configs['flat/recommended']
const { plugins: securityPlugins, ...securityRecommendedConfig } = securityPlugin.configs.recommended

/**
 * ESLint Configuration for EduPlay Frontend
 *
 * Stack: React 19 + Vite + Tailwind CSS 4 + Framer Motion
 * Objetivo: Código limpio, accesible, seguro y mantenible
 * Alineado con SonarCloud para feedback local de calidad
 */
export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage', '*.min.js']),

  // SonarJS: reglas de calidad equivalentes a SonarCloud (feedback local)
  {
    ...sonarRecommendedConfig,
    plugins: {
      ...sonarPlugins,
      sonarjs,
    },
  },

  // Security: detección de patrones inseguros (CWE-78, CWE-185, CWE-94)
  {
    ...securityRecommendedConfig,
    plugins: {
      ...securityPlugins,
      security: securityPlugin,
    },
  },

  // Regexp: análisis profundo de regex, ReDoS (CWE-185/400)
  {
    ...regexpRecommendedConfig,
    plugins: {
      ...regexpPlugins,
      regexp,
    },
  },

  // Promise: detección de promises sin manejar (S2966, S4327)
  {
    ...promiseRecommendedConfig,
    plugins: {
      ...promisePlugins,
      promise,
    },
  },

  // Configuración base para archivos JS/JSX
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      react,
      'no-secrets': noSecrets,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // ==========================================
      // VARIABLES Y IMPORTS
      // ==========================================
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]|^motion$',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // ==========================================
      // REACT
      // ==========================================
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-curly-brace-presence': ['warn', {
        props: 'never',
        children: 'never'
      }],
      'react/self-closing-comp': ['warn', {
        component: true,
        html: true,
      }],
      'react/jsx-boolean-value': ['warn', 'never'],

      // ==========================================
      // REACT HOOKS
      // ==========================================
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Familia de reglas dependientes de React Compiler: el proyecto usa
      // @vitejs/plugin-react-swc sin Compiler, por lo que se desactivan
      // explicitamente para evitar falsos positivos.
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-compiler/react-compiler': 'off',

      // ==========================================
      // ACCESIBILIDAD (A11Y)
      // ==========================================
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/mouse-events-have-key-events': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-to-interactive-role': 'warn',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/tabindex-no-positive': 'warn',

      // ==========================================
      // SONARJS — Reglas base (ajustes sobre recommended)
      // ==========================================
      'sonarjs/cognitive-complexity': ['warn', 50],
      'sonarjs/pseudo-random': 'warn',
      'sonarjs/todo-tag': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-redundant-assignments': 'warn',
      'sonarjs/no-ignored-exceptions': 'warn',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/slow-regex': 'warn',
      'sonarjs/no-unused-vars': 'warn',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/unused-import': 'warn',
      'sonarjs/no-all-duplicated-branches': 'warn',
      'sonarjs/concise-regex': 'warn',
      'sonarjs/duplicates-in-character-class': 'warn',

      // ==========================================
      // SONARJS — Seguridad (activadas desde "off" en recommended)
      // Solo las relevantes para contexto browser
      // ==========================================
      'sonarjs/sockets': 'warn',

      // ==========================================
      // SONARJS — Mantenibilidad (activadas desde "off")
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
      // SECURITY — Overrides para contexto browser
      // ==========================================
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-require': 'off',
      'security/detect-child-process': 'off',

      // ==========================================
      // NO-SECRETS — CWE-798 (credenciales hardcodeadas)
      // ==========================================
      'no-secrets/no-secrets': ['warn', { tolerance: 4.5 }],

      // ==========================================
      // REGEXP — Ajustes sobre flat/recommended
      // Reglas estilísticas como warn (no son bugs, son mejoras de legibilidad)
      // ==========================================
      'regexp/prefer-d': 'warn',
      'regexp/use-ignore-case': 'warn',
      'regexp/prefer-w': 'warn',
      'regexp/no-dupe-characters-character-class': 'warn',

      // ==========================================
      // PROMISE — Overrides sobre flat/recommended para React
      // ==========================================
      'promise/always-return': 'warn',
      'promise/catch-or-return': 'warn',
      'promise/param-names': 'warn',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',

      // ==========================================
      // BUENAS PRÁCTICAS
      // ==========================================
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'warn',
      'no-duplicate-imports': 'error',
      'object-shorthand': ['warn', 'always'],
      'prefer-template': 'warn',
      'prefer-destructuring': ['warn', {
        array: false,
        object: true,
      }],

      // ==========================================
      // REACT REFRESH (HMR)
      // ==========================================
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // Configuración específica para archivos de test
  {
    files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}', '**/tests/**'],
    rules: {
      'no-console': 'off',
      'react/prop-types': 'off',
      'no-secrets/no-secrets': 'off',
      'promise/always-return': 'off',
      'promise/catch-or-return': 'off',
    },
  },

  // Configuración para archivos de configuración
  {
    files: ['*.config.{js,mjs}', 'vite.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
])
