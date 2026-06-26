import { logger, logError } from './logger.js';

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

    try {
      const response = await fetch(job.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: job.event, payload: job.payload }),
      });

      if (response.ok) {
        logger.info('Webhook delivered successfully', { jobId: job.id, status: response.status });
        this.queue.delete(job.id);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      logError('WebhookQueue', error, { jobId: job.id, attempt: job.attempts });

      if (job.attempts >= job.maxAttempts) {
        logger.error('Webhook failed permanently, moving to dead letter', { jobId: job.id });
        this.queue.delete(job.id);
        // Could be persisted to a dead letter store here
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
}

export const webhookQueue = new WebhookQueue();
export default webhookQueue;
