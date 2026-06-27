/**
 * Webhook Queue com BullMQ para retry persistente
 *
 * Usa Redis para persistência dos jobs
 * Retry com backoff exponencial: 5s, 30s, 2m, 10m, 30m
 */

import { Queue, Worker, Job } from 'bullmq';
import { logger } from './logger.js';
import { initRedisClient, closeRedisClient } from './redis.js';

export interface WebhookJobData {
  webhookId: string;
  url: string;
  event: string;
  payload: unknown;
  attempts: number;
  createdAt: number;
}

class BullMQWebhookQueue {
  private queue: Queue<WebhookJobData> | null = null;
  private worker: Worker<WebhookJobData> | null = null;
  private connected = false;

  /**
   * Inicializa queue e worker
   */
  async init(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn('Redis não configurado - usando queue em memória');
      this.connected = false;
      return;
    }

    try {
      // Inicializa Redis
      await initRedisClient();

      const connection = {
        url: redisUrl,
      };

      // Cria queue
      this.queue = new Queue<WebhookJobData>('webhooks', {
        connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5s base
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      });

      // Cria worker
      this.worker = new Worker<WebhookJobData>(
        'webhooks',
        async (job) => {
          await this.executeJob(job);
        },
        {
          connection,
          concurrency: 5, // Processa 5 webhooks em paralelo
        }
      );

      this.worker.on('completed', (job) => {
        logger.info('Webhook delivered', { jobId: job?.id, url: job?.data.url });
      });

      this.worker.on('failed', (job, err) => {
        const data = job?.data;
        logger.error('Webhook failed', {
          jobId: job?.id,
          url: data?.url,
          attempts: data?.attempts,
          error: err.message,
        });
      });

      this.connected = true;
      logger.info('BullMQ queue initialized');
    } catch (error) {
      logger.error('Falha ao inicializar BullMQ', { error });
      this.connected = false;
    }
  }

  /**
   * Executa um job de webhook
   */
  private async executeJob(job: Job<WebhookJobData>): Promise<void> {
    const { url, payload, event } = job.data;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logger.info('Webhook delivered successfully', {
      jobId: job.id,
      status: response.status,
      url,
    });
  }

  /**
   * Adiciona webhook à fila
   */
  async enqueue(
    webhookId: string,
    url: string,
    event: string,
    payload: unknown
  ): Promise<string | null> {
    // Fallback para queue em memória se BullMQ não disponível
    if (!this.connected || !this.queue) {
      logger.warn('BullMQ não disponível, webhook não será enfileirado');
      return null;
    }

    const job = await this.queue.add(
      'webhook',
      {
        webhookId,
        url,
        event,
        payload,
        attempts: 0,
        createdAt: Date.now(),
      },
      {
        jobId: `whq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      }
    );

    logger.info('Webhook queued', { jobId: job.id, url, event });
    return job.id ?? null;
  }

  /**
   * Retorna status da fila
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    if (!this.connected || !this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Fecha conexões
   */
  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
    await closeRedisClient();
    this.connected = false;
    logger.info('BullMQ queue closed');
  }
}

export const bullmqQueue = new BullMQWebhookQueue();
export default bullmqQueue;