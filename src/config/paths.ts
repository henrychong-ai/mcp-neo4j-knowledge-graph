import path from 'path';
import * as fs from 'fs';

/**
 * Get the absolute path to the data directory
 * Creates the directory if it doesn't exist
 * @returns The absolute path to the data directory
 */
export function getDataDirectoryPath(): string {
  // Check if an absolute path is provided in the environment variable
  const envPath = process.env.MEMORY_FILE_PATH;

  // If an absolute path is provided, extract its directory
  if (envPath && path.isAbsolute(envPath)) {
    const envDir = path.dirname(envPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    return envDir;
  }

  // Otherwise, use the default data directory
  const dataDir = path.join(process.cwd(), 'data');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
}

/**
 * Resolve the memory file path based on environment variable or default
 * @param envPath Optional path from environment variable
 * @param dataDir Data directory path
 * @returns Resolved path to the memory file
 */
export function resolveMemoryFilePath(envPath: string | undefined, dataDir: string): string {
  const defaultPath = path.join(dataDir, 'memory.sqlite');

  if (!envPath) {
    return defaultPath;
  }

  return path.isAbsolute(envPath) ? envPath : path.join(dataDir, envPath);
}
