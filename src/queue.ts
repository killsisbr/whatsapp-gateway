import { logger, logError } from './logger.js';
import { CircuitBreaker } from './circuitBreaker.js';

export interface QueuedWebhook {
  id: string;
  webhookId: string;
  url: string;
  event: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  nextRetry: number;
  createdAt: number;
}

// Circuit breakers por domínio
const circuitBreakers: Map<string, CircuitBreaker> = new Map();

function getCircuitBreaker(url: string): CircuitBreaker {
  const domain = new URL(url).hostname;
  if (!circuitBreakers.has(domain)) {
    circuitBreakers.set(domain, new CircuitBreaker(async () => {}, {
      threshold: 5,
      timeout: 60000, // 1 minuto
      halfOpenRequests: 2,
    }));
  }
  return circuitBreakers.get(domain)!;
}

class WebhookQueue {
  private queue: Map<string, QueuedWebhook> = new Map();
  private retryIntervals: number[] = [5000, 30000, 120000, 600000, 1800000]; // 5s, 30s, 2m, 10m, 30m
  private processing = false;

  async enqueue(webhookId: string, url: string, event: string, payload: unknown): Promise<void> {
    const job: QueuedWebhook = {
      id: `whq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      webhookId,
      url,
      event,
      payload,
      attempts: 0,
      maxAttempts: 5,
      nextRetry: Date.now(),
      createdAt: Date.now(),
    };
    this.queue.set(job.id, job);
    logger.info('Webhook queued for retry', { jobId: job.id, url, event });
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.size > 0) {
      const now = Date.now();
      const dueJobs = Array.from(this.queue.values()).filter(j => j.nextRetry <= now);

      if (dueJobs.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      for (const job of dueJobs) {
        await this.executeJob(job);
      }
    }

    this.processing = false;
  }

  private async executeJob(job: QueuedWebhook): Promise<void> {
    job.attempts++;
    logger.info('Retrying webhook', { jobId: job.id, attempt: job.attempts, url: job.url });

    // Verifica circuit breaker para este domínio
    const breaker = getCircuitBreaker(job.url);
    const stats = breaker.getStats();

    if (stats.state === 'OPEN') {
      logger.warn('Circuit breaker OPEN, postponing webhook', {
        jobId: job.id,
        url: job.url,
        ...stats
      });
      // Reagenda para depois
      job.nextRetry = Date.now() + 60000;
      this.queue.set(job.id, job);
      return;
    }

    try {
      // Executa com circuit breaker
      await breaker.call(async () => {
        const response = await fetch(job.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: job.event, payload: job.payload }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      });

      logger.info('Webhook delivered successfully', { jobId: job.id, status: 'OK' });
      this.queue.delete(job.id);
    } catch (error) {
      logError('WebhookQueue', error, { jobId: job.id, attempt: job.attempts });

      if (job.attempts >= job.maxAttempts) {
        logger.error('Webhook failed permanently, moving to dead letter', { jobId: job.id });
        this.queue.delete(job.id);
      } else {
        const delayIndex = Math.min(job.attempts - 1, this.retryIntervals.length - 1);
        job.nextRetry = Date.now() + this.retryIntervals[delayIndex];
        this.queue.set(job.id, job);
      }
    }
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getQueueStatus(): { total: number; byAttempts: Record<number, number> } {
    const byAttempts: Record<number, number> = {};
    for (const job of this.queue.values()) {
      byAttempts[job.attempts] = (byAttempts[job.attempts] || 0) + 1;
    }
    return { total: this.queue.size, byAttempts };
  }

  async flush(): Promise<void> {
    // Força processamento imediato de todos os webhooks pendentes
    logger.info('Flushing webhook queue', { pending: this.queue.size });
    const jobs = Array.from(this.queue.values());
    for (const job of jobs) {
      job.nextRetry = Date.now(); // Tenta entregar agora
      this.queue.set(job.id, job);
    }
    await this.processQueue();
    logger.info('Webhook queue flushed', { remaining: this.queue.size });
  }
}

export const webhookQueue = new WebhookQueue();
export default webhookQueue;
