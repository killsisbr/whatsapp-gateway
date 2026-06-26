import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = path.join(__dirname, '..', 'logs');

// Formato customizado para produção (JSON)
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Formato para desenvolvimento (colorido e legível)
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'whatsapp-gateway' },
  transports: [
    // Console (sempre ativo)
    new winston.transports.Console({
      stderrLevels: ['error', 'warn'],
    }),
    // Arquivo de errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Arquivo combinado (apenas em produção)
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ] : []),
  ],
  exitOnError: false,
});

// Helper functions
export const logContext = (ctx: string, message: string, meta?: Record<string, unknown>) => {
  logger.info(message, { context: ctx, ...meta });
};

export const logError = (ctx: string, error: Error | unknown, meta?: Record<string, unknown>) => {
  if (error instanceof Error) {
    logger.error(`${ctx}: ${error.message}`, { context: ctx, stack: error.stack, ...meta });
  } else {
    logger.error(`${ctx}: ${String(error)}`, { context: ctx, ...meta });
  }
};

export default logger;
