/**
 * Test file to verify FileStorageProvider deprecation warnings
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { FileStorageProvider } from '../FileStorageProvider.js';
import path from 'path';
import fs from 'fs';

describe('FileStorageProvider Deprecation', () => {
  const testDir = path.join(process.cwd(), 'test-output', 'file-provider-deprecation');
  const testFile = path.join(testDir, 'test.json');

  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    // Setup test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Mock console.warn
    originalConsoleWarn = console.warn;
    console.warn = vi.fn();

    // Clear mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore console.warn
    console.warn = originalConsoleWarn;

    // Clean up any created temp files
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Comment out the tests that check for console.warn calls
  // since we've removed those to fix JSON protocol issues
  // it('should emit deprecation warning in constructor', () => {
  //   // Act
  //   new FileStorageProvider();

  //   // Assert
  //   expect(console.warn).toHaveBeenCalledWith(
  //     expect.stringContaining('FileStorageProvider is deprecated')
  //   );
  // });

  // it('should emit deprecation warning with explicit options', () => {
  //   // Act
  //   new FileStorageProvider({ memoryFilePath: TEST_FILEPATH });

  //   // Assert
  //   expect(console.warn).toHaveBeenCalledWith(
  //     expect.stringContaining('FileStorageProvider is deprecated')
  //   );
  // });

  // Add a new test that still validates the provider is initialized correctly
  it('should initialize correctly even with deprecation warning removed', () => {
    // Act
    const provider = new FileStorageProvider({ memoryFilePath: testFile });

    // Assert - verify the provider initialized correctly
    expect(provider).toBeInstanceOf(FileStorageProvider);
  });
});
