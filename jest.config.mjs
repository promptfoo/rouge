export default {
  // The root directory that Jest should scan for tests and modules within
  rootDir: '.',

  // The test environment that will be used for testing
  testEnvironment: 'node',

  // The glob patterns Jest uses to detect test files
  testMatch: ['**/?(*.)+(spec|test).ts'],

  // An array of file extensions your modules use
  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],

  // A list of paths to directories that Jest should use to search for files in
  roots: ['<rootDir>/src', '<rootDir>/test'],

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // Include source modules even when no test imports them
  collectCoverageFrom: ['src/**/*.ts'],

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ['json', 'text', 'lcov', 'clover'],

  coverageThreshold: {
    global: {
      branches: 98,
      functions: 100,
      lines: 99,
      statements: 99,
    },
  },

  // The maximum amount of workers used to run your tests
  maxWorkers: '50%',

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  // Indicates whether each individual test should be reported during the run
  verbose: true,
};
