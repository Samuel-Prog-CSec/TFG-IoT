module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'], // 'lcov' es el que lee SonarCloud
  coveragePathIgnorePatterns: ['/node_modules/', '/scripts/', '/seeders/', '/docs/'],
  testTimeout: 30000,
  // Umbrales mínimos de cobertura — protegen contra regresiones.
  // Valores actuales (abr 2026): Stmts 72%, Branch 57%, Funcs 75%, Lines 72%
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 50,
      functions: 65,
      lines: 65
    }
  },
  // IMPORTANT: these tests share a single DB + server instance (see tests/setup.js).
  // Running in parallel causes flaky 401/500 due to cross-worker DB drops and shared ports.
  maxWorkers: 1,
  detectOpenHandles: true
};
