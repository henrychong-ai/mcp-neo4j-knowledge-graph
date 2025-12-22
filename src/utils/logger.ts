/**
 * Simple logger utility that wraps console methods
 * Avoids direct console usage which can interfere with MCP stdio
 *
 * Environment variables:
 * - LOG_LEVEL: Set to 'debug', 'info', 'warn', or 'error' (default: 'warn')
 * - DEBUG: Set to any value to enable debug logging
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getLogLevel(): number {
  // During tests, default to silent unless explicitly set
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_LEVEL) {
    return LOG_LEVELS.silent;
  }

  // DEBUG env var enables debug logging
  if (process.env.DEBUG) {
    return LOG_LEVELS.debug;
  }

  // Check LOG_LEVEL env var
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && level in LOG_LEVELS) {
    return LOG_LEVELS[level as keyof typeof LOG_LEVELS];
  }

  // Default to warn level (minimal output)
  return LOG_LEVELS.warn;
}

export const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (message: string, ...args: any[]) => {
    if (getLogLevel() <= LOG_LEVELS.info) {
      process.stderr.write(`[INFO] ${message}\n`);
      if (args.length > 0) {
        process.stderr.write(`${JSON.stringify(args, null, 2)}\n`);
      }
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (message: string, error?: any) => {
    if (getLogLevel() <= LOG_LEVELS.error) {
      process.stderr.write(`[ERROR] ${message}\n`);
      if (error) {
        process.stderr.write(
          `${error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}\n`
        );
      }
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (message: string, ...args: any[]) => {
    if (getLogLevel() <= LOG_LEVELS.debug) {
      process.stderr.write(`[DEBUG] ${message}\n`);
      if (args.length > 0) {
        process.stderr.write(`${JSON.stringify(args, null, 2)}\n`);
      }
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (message: string, ...args: any[]) => {
    if (getLogLevel() <= LOG_LEVELS.warn) {
      process.stderr.write(`[WARN] ${message}\n`);
      if (args.length > 0) {
        process.stderr.write(`${JSON.stringify(args, null, 2)}\n`);
      }
    }
  },
};
