import fs from 'node:fs';
import path from 'node:path';
import pino, { type Logger } from 'pino';

// Ensure log directory exists
const logsDir = path.join(process.cwd(), 'data');
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch {
  console.error('Failed to create logs directory');
}

const isProd: boolean = process.env.NODE_ENV === 'production';

const logger: Logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          singleLine: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          colorize: true,
        },
      },
      {
        target: 'pino-rotating-file-stream',
        options: {
          path: logsDir,
          filename: 'app.log',
          size: '1M',
          maxFiles: 1,
          compress: false,
          // interval: '7d',
          // immutable: true,
        },
      },
    ],
  },
});

export function createLogger(bindings?: Record<string, unknown>): Logger {
  return bindings ? logger.child(bindings) : logger;
}

export default logger;
