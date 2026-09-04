/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Integration tests spin up a real (in-memory) MongoDB via
  // mongodb-memory-server, which downloads a MongoDB binary on first run —
  // this needs outbound network access to https://fastdl.mongodb.org (or a
  // pre-seeded cache dir, see tests/README.md). Unit tests under
  // tests/unit/ have no such dependency and always run offline.
  testTimeout: 30000,
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  collectCoverageFrom: ['services/**/*.js', 'utils/**/*.js', 'middleware/**/*.js', '!**/node_modules/**'],
};
