/**
 * Minimal Jest config so `npm test` can pick up .ts specs without a
 * separate compile step. Mirrors the project's tsconfig (strict, ES2021).
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
