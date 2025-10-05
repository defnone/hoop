import fs from 'node:fs';
import path from 'node:path';
import { createLogger as createWinstonLogger, format, transports } from 'winston';
import type { Logger as WinstonLogger } from 'winston';

interface AppLogger {
  debug: (message: unknown, ...meta: unknown[]) => void;
  info: (message: unknown, ...meta: unknown[]) => void;
  warn: (message: unknown, ...meta: unknown[]) => void;
  error: (message: unknown, ...meta: unknown[]) => void;
  child: (bindings?: Record<string, unknown>) => AppLogger;
}

const logsDir: string = path.join(process.cwd(), 'data');
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch (error) {
  console.error('Failed to create logs directory', error);
}

const isProd: boolean = process.env.NODE_ENV === 'production';
const logLevel: string = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable object]';
    }
  }
  return String(value);
}

function normalizeMetaValue(value: unknown): unknown {
  if (value instanceof Error) return formatError(value);
  if (isRecord(value)) return value;
  return { value };
}

function prepareLogArguments(primary: unknown, rest: unknown[]): { message: string; meta: unknown[] } {
  if (isRecord(primary) && rest.length > 0 && typeof rest[0] === 'string') {
    const [message, ...remaining] = rest;
    return { message, meta: [primary, ...remaining] };
  }
  return { message: stringify(primary), meta: rest };
}

function createAppLoggerInstance(instance: WinstonLogger): AppLogger {
  const log = (level: 'debug' | 'info' | 'warn' | 'error') => (primary: unknown, ...rest: unknown[]) => {
    const { message, meta } = prepareLogArguments(primary, rest);
    const normalizedMeta: unknown[] = meta.map(normalizeMetaValue);
    instance.log(level, message, ...normalizedMeta);
  };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child(bindings?: Record<string, unknown>): AppLogger {
      if (!bindings || Object.keys(bindings).length === 0) {
        return createAppLoggerInstance(instance);
      }
      const childLogger: WinstonLogger = instance.child({ defaultMeta: bindings });
      return createAppLoggerInstance(childLogger);
    },
  };
}

const baseLogger: WinstonLogger = createWinstonLogger({
  level: logLevel,
  format: format.combine(format.timestamp(), format.errors({ stack: true })),
  defaultMeta: {},
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ level, message, timestamp, ...meta }) => {
          const metadata = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp as string} ${level}: ${message}${metadata}`;
        }),
      ),
    }),
    new transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 1_000_000,
      maxFiles: 1,
      tailable: true,
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
  exitOnError: false,
});

const logger: AppLogger = createAppLoggerInstance(baseLogger);

export function createLogger(bindings?: Record<string, unknown>): AppLogger {
  return bindings ? logger.child(bindings) : logger;
}

export default logger;
