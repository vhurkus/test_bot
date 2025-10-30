/**
 * Jest Setup File
 * Runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Set test configuration
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.DATABASE_LOGGING = 'false';

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set timeout for async tests
jest.setTimeout(30000);
