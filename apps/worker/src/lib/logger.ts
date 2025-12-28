/**
 * Structured logging with pino
 *
 * Usage:
 *   import { logger } from './lib/logger';
 *   logger.info({ documentId }, 'Processing document');
 *   logger.error({ err, documentId }, 'Failed to process');
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'moneio-worker',
    version: process.env.npm_package_version || '0.1.0',
  },
});

// Create child loggers for each worker type
export const workerLoggers = {
  docNormalize: logger.child({ worker: 'doc-normalize' }),
  docOcr: logger.child({ worker: 'doc-ocr' }),
  docExtract: logger.child({ worker: 'doc-extract' }),
  docPostprocess: logger.child({ worker: 'doc-postprocess' }),
  categorization: logger.child({ worker: 'categorization' }),
  fxFetch: logger.child({ worker: 'fx-fetch' }),
};

export type WorkerLogger = pino.Logger;
