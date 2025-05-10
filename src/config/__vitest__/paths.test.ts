/**
 * Test file for the paths configuration module
 * Migrated from Jest to Vitest and converted to TypeScript
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';

// Mock fs module
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', async () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
  },
}));

describe('paths configuration module', () => {
  let pathsModule: typeof import('../paths');
  let originalProcessEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original process.env
    originalProcessEnv = { ...process.env };

    // Reset all mocks before each test
    vi.resetAllMocks();

    // Reset modules to ensure fresh imports
    vi.resetModules();

    // Now import the module under test (AFTER mocking)
    pathsModule = await import('../paths');
  });

  afterEach(() => {
    // Restore original process.env
    process.env = originalProcessEnv;
  });

  describe('getDataDirectoryPath', () => {
    it('should return the correct data directory path when MEMORY_FILE_PATH is not set', () => {
      // Arrange
      process.env.MEMORY_FILE_PATH = undefined;
      mockExistsSync.mockReturnValue(true);
      const expectedPath = path.join(process.cwd(), 'data');

      // Act
      const result = pathsModule.getDataDirectoryPath();

      // Assert
      expect(result).toBe(expectedPath);
    });

    it('should create the data directory if it does not exist and MEMORY_FILE_PATH is not set', () => {
      // Arrange
      process.env.MEMORY_FILE_PATH = undefined;
      mockExistsSync.mockReturnValue(false);
      const expectedPath = path.join(process.cwd(), 'data');

      // Act
      const result = pathsModule.getDataDirectoryPath();

      // Assert
      expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockMkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
      expect(result).toBe(expectedPath);
    });

    it('should not create the data directory if it already exists and MEMORY_FILE_PATH is not set', () => {
      // Arrange
      process.env.MEMORY_FILE_PATH = undefined;
      mockExistsSync.mockReturnValue(true);

      // Act
      pathsModule.getDataDirectoryPath();

      // Assert
      expect(mockExistsSync).toHaveBeenCalled();
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('should use the directory from absolute MEMORY_FILE_PATH', () => {
      // Arrange
      const absolutePath = '/custom/path/memory.sqlite';
      process.env.MEMORY_FILE_PATH = absolutePath;
      mockExistsSync.mockReturnValue(true);
      const expectedPath = path.dirname(absolutePath); // '/custom/path'

      // Act
      const result = pathsModule.getDataDirectoryPath();

      // Assert
      expect(result).toBe(expectedPath);
      expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should create the directory from absolute MEMORY_FILE_PATH if it does not exist', () => {
      // Arrange
      const absolutePath = '/custom/path/memory.sqlite';
      process.env.MEMORY_FILE_PATH = absolutePath;
      mockExistsSync.mockReturnValue(false);
      const expectedPath = path.dirname(absolutePath); // '/custom/path'

      // Act
      const result = pathsModule.getDataDirectoryPath();

      // Assert
      expect(result).toBe(expectedPath);
      expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
      expect(mockMkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
    });

    it('should ignore relative paths in MEMORY_FILE_PATH and use default data directory', () => {
      // Arrange
      process.env.MEMORY_FILE_PATH = 'relative/path/memory.sqlite';
      mockExistsSync.mockReturnValue(true);
      const expectedPath = path.join(process.cwd(), 'data');

      // Act
      const result = pathsModule.getDataDirectoryPath();

      // Assert
      expect(result).toBe(expectedPath);
    });
  });

  describe('resolveMemoryFilePath', () => {
    it('should return the default path when envPath is undefined', () => {
      // Arrange
      const dataDir = '/test/data';
      const expectedPath = path.join(dataDir, 'memory.sqlite');

      // Act
      const result = pathsModule.resolveMemoryFilePath(undefined, dataDir);

      // Assert
      expect(result).toBe(expectedPath);
    });

    it('should return the envPath when it is an absolute path', () => {
      // Arrange
      const dataDir = '/test/data';
      const envPath = '/absolute/path/to/memory.sqlite';

      // Act
      const result = pathsModule.resolveMemoryFilePath(envPath, dataDir);

      // Assert
      expect(result).toBe(envPath);
    });

    it('should join dataDir and envPath when envPath is a relative path', () => {
      // Arrange
      const dataDir = '/test/data';
      const envPath = 'relative/path/to/memory.sqlite';
      const expectedPath = path.join(dataDir, envPath);

      // Act
      const result = pathsModule.resolveMemoryFilePath(envPath, dataDir);

      // Assert
      expect(result).toBe(expectedPath);
    });
  });
});
