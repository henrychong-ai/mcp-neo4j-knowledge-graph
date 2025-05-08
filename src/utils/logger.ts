/**
 * Simple logger utility that wraps console methods
 * Avoids direct console usage which can interfere with MCP stdio
 */
export const logger = {
  info: (message: string, ...args: any[]) => {
    process.stderr.write(`[INFO] ${message}\n`);
    if (args.length > 0) {
      process.stderr.write(`${JSON.stringify(args, null, 2)}\n`);
    }
  },

  error: (message: string, error?: any) => {
    process.stderr.write(`[ERROR] ${message}\n`);
    if (error) {
      process.stderr.write(
        `${error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}\n`
      );
    }
  },

  debug: (message: string, ...args: any[]) => {
    process.stderr.write(`[DEBUG] ${message}\n`);
    if (args.length > 0) {
      process.stderr.write(`${JSON.stringify(args, null, 2)}\n`);
    }
  },

  warn: (message: string, ...args: any[]) => {
    process.stderr.write(`[WARN] ${message}\n`);
    if (args.length > 0) {
      process.stderr.write(`${JSON.stringify(args, null, 2)}\n`);
    }
  },
};
