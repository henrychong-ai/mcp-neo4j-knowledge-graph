/**
 * Mock implementation for the fs module
 * Written in JavaScript to avoid TypeScript typing issues with complex mocking
 */
import { jest } from '@jest/globals';

// Create mock functions
export const mockReadFile = jest.fn();
export const mockWriteFile = jest.fn();

// Export the fs object to match the structure of the original module
// The original module imports { promises as fs } from 'fs' and exports { fs }
export const fs = {
  readFile: mockReadFile,
  writeFile: mockWriteFile,
};
