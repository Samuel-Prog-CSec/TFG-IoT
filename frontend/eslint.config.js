import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import sonarjs from 'eslint-plugin-sonarjs'
import { defineConfig, globalIgnores } from 'eslint/config'

// Extraer plugins de sonarjs para evitar redefinición (mismo patrón que backend)
const { plugins: sonarPlugins, ...sonarRecommendedConfig } = sonarjs.configs.recommended

/**
 * ESLint Configuration for EduPlay Frontend
 * 
 * Stack: React 19 + Vite + Tailwind CSS 4 + Framer Motion
 * Objetivo: Código limpio, accesible y mantenible
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
      'react/jsx-uses-react': 'off', // React 19 no necesita import React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // Desactivado: el proyecto usa JSDoc para documentar props
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
      // Desactivar reglas muy estrictas de React 19 que entran en conflicto
      // con patrones de animación aleatorios (Framer Motion, confetti, etc.)
      // y con setState en efectos para sincronización de estado derivado
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
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
      // SONARJS (calidad de código, feedback local)
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
