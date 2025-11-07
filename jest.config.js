/** @type {import('jest').Config} */
export default {
  // Use ES modules
  preset: null,
  testEnvironment: 'node',

  // Transform files with ts-jest for TypeScript or babel for ES modules
  transform: {},
  extensionsToTreatAsEsm: ['.js'],

  // Module file extensions
  moduleFileExtensions: ['js', 'json'],

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],

  // Coverage
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.d.js',
  ],

  // Use 'node' module resolution for ES modules
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Add setup file if needed
  setupFilesAfterEnv: [],

  // Verbose output
  verbose: true,
};