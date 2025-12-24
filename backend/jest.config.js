module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
  // IMPORTANT: these tests share a single DB + server instance (see tests/setup.js).
  // Running in parallel causes flaky 401/500 due to cross-worker DB drops and shared ports.
  maxWorkers: 1,
  detectOpenHandles: true
};
