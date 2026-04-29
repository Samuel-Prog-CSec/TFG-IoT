import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  // Solo el plugin de React — @tailwindcss/vite se omite porque no es
  // necesario para tests unitarios y puede causar hangs en CI al intentar
  // compilar CSS en workers que no terminan correctamente.
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Secuencial (sin paralelismo entre archivos): previene OOM en workers
    // de tinypool con Node 24, que causan ERR_WORKER_OUT_OF_MEMORY y hang
    // infinito en CI. El crash ocurre en el cleanup del worker al terminar;
    // el script npm "test" usa --no-file-parallelism para mitigarlo.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/**',
        '**/*.test.{js,jsx}',
        '**/__tests__/**',
        '*.config.{js,mjs,cjs}',
        'eslint.config.js',
        'vite.config.js'
      ],
      // Umbrales mínimos de cobertura — protegen contra regresiones.
      // Valores actuales (abr 2026): Stmts 65%, Branch 53%, Funcs 62%, Lines 66%
      thresholds: {
        statements: 55,
        branches: 45,
        functions: 55,
        lines: 55,
      }
    }
  }
});
