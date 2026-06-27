/**
 * Rate Limiting com Redis para WhatsApp Gateway
 *
 * Permite rate limiting compartilhado entre múltiplas instâncias
 *
 * Uso:
 *   npm install redis
 *   export REDIS_URL=redis://localhost:6379
 */

import { createClient } from 'redis';
import { logger } from './logger.js';

let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Inicializa cliente Redis
 */
export async function initRedisClient(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn('Redis não configurado - usando rate limiting em memória');
    return;
  }

  try {
    redisClient = createClient({ url: redisUrl });

    redisClient.on('error', (err) => {
      logger.error('Redis error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis conectado', { url: redisUrl });
    });

    await redisClient.connect();
    logger.info('Redis client initialized');
  } catch (error) {
    logger.error('Falha ao conectar Redis', { error });
    redisClient = null;
  }
}

/**
 * Incrementa contador de requisições para uma chave
 * Retorna o número atual de requisições no window
 */
export async function incrementRateLimit(
  key: string,
  windowMs: number = 60000,
  maxRequests: number = 100
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  // Fallback para memória se Redis não disponível
  if (!redisClient || !redisClient.isOpen) {
    return incrementRateLimitMemory(key, windowMs, maxRequests);
  }

  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;
  const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;

  try {
    // Incrementa contador atômico
    const current = await redisClient.incr(windowKey);

    // Define TTL se é primeira requisição no window
    if (current === 1) {
      await redisClient.expire(windowKey, Math.ceil(windowMs / 1000));
    }

    const remaining = Math.max(0, maxRequests - current);

    return {
      allowed: current <= maxRequests,
      remaining,
      resetAt,
    };
  } catch (error) {
    logger.error('Redis rate limit error', { error });
    // Fallback para memória em caso de erro
    return incrementRateLimitMemory(key, windowMs, maxRequests);
  }
}

/**
 * Fallback em memória para quando Redis não está disponível
 */
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function incrementRateLimitMemory(
  key: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const storeKey = `ratelimit:${key}:${windowStart}`;

  const entry = memoryStore.get(storeKey);

  if (!entry || entry.resetAt < now) {
    // Novo window
    memoryStore.set(storeKey, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  const newCount = entry.count + 1;
  entry.count = newCount;
  memoryStore.set(storeKey, entry);

  return {
    allowed: newCount <= maxRequests,
    remaining: Math.max(0, maxRequests - newCount),
    resetAt,
  };
}

/**
 * Limpa store de memória periodicamente
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60000); // Limpa a cada minuto

/**
 * Fecha conexão Redis
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

export default { initRedisClient, incrementRateLimit, closeRedisClient };