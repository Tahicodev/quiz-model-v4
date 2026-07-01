import winston from 'winston';
import { config } from './config.js';

const { combine, timestamp, printf, colorize } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

export const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp(),
    config.nodeEnv !== 'production' ? colorize() : winston.format.uncolorize(),
    customFormat
  ),
  transports: [
    new winston.transports.Console()
  ],
});
