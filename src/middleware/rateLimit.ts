import rateLimit from 'express-rate-limit';
import { logger } from '../logger.js';

// Rate limiting para tenants (por API key)
export const tenantRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  keyGenerator: ((req: any) => {
    return req.headers['x-api-key']?.toString() ||
           req.headers['authorization']?.toString() ||
           req.ip || 'unknown';
  }) as any,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded. Please retry after some time.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)) / 1000),
  },
  handler: (req: any, res: any) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      apiKey: req.headers['x-api-key'],
      path: req.path,
    });
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)) / 1000),
    });
  },
});

// Rate limiting agressivo para rotas de autenticação
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: ((req: any) => req.ip || 'unknown') as any,
  message: { error: 'Too many login attempts. Please try again later.' },
  handler: (req: any, res: any) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({ error: 'Too many attempts', retryAfter: 900 });
  },
});

export default { tenantRateLimit, authRateLimit };