/**
 * Métricas Prometheus para WhatsApp Gateway
 *
 * Expõe métricas no formato Prometheus no endpoint /metrics
 *
 * Métricas disponíveis:
 * - gateway_requests_total: Total de requisições HTTP
 * - gateway_webhooks_total: Webhooks disparados
 * - gateway_webhook_failures_total: Webhooks falhados
 * - gateway_session_duration_seconds: Duração de sessões WhatsApp
 * - gateway_audit_events_total: Eventos de audit log
 * - gateway_queue_size: Tamanho da fila de webhooks
 */

import { logger } from './logger.js';

/**
 * Coletor de métricas
 */
class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private labels: Map<string, Record<string, string>[]> = new Map();

  /**
   * Incrementa um contador
   */
  incCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    if (!this.labels.has(key)) {
      this.labels.set(key, []);
    }
    this.labels.get(key)?.push(labels);
  }

  /**
   * Observa um valor para histograma
   */
  observeHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)?.push(value);
  }

  /**
   * Gera output no formato Prometheus
   */
  generateMetrics(): string {
    const lines: string[] = [];

    // Counters
    lines.push('# HELP gateway_requests_total Total HTTP requests');
    lines.push('# TYPE gateway_requests_total counter');
    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith('requests')) {
        const labels = this.formatLabels(key);
        lines.push(`gateway_requests_total${labels} ${value}`);
      }
    }

    lines.push('');
    lines.push('# HELP gateway_webhooks_total Total webhooks dispatched');
    lines.push('# TYPE gateway_webhooks_total counter');
    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith('webhooks_total')) {
        const labels = this.formatLabels(key);
        lines.push(`gateway_webhooks_total${labels} ${value}`);
      }
    }

    lines.push('');
    lines.push('# HELP gateway_webhook_failures_total Total webhook failures');
    lines.push('# TYPE gateway_webhook_failures_total counter');
    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith('webhook_failures')) {
        const labels = this.formatLabels(key);
        lines.push(`gateway_webhook_failures_total${labels} ${value}`);
      }
    }

    lines.push('');
    lines.push('# HELP gateway_audit_events_total Total audit log events');
    lines.push('# TYPE gateway_audit_events_total counter');
    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith('audit_events')) {
        const labels = this.formatLabels(key);
        lines.push(`gateway_audit_events_total${labels} ${value}`);
      }
    }

    lines.push('');
    lines.push('# HELP gateway_queue_size Current webhook queue size');
    lines.push('# TYPE gateway_queue_size gauge');
    lines.push('gateway_queue_size 0'); // Será atualizado externamente

    lines.push('');
    lines.push('# HELP gateway_session_duration_seconds Session duration');
    lines.push('# TYPE gateway_session_duration_seconds histogram');
    for (const [name, values] of this.histograms.entries()) {
      if (name === 'session_duration') {
        const sum = values.reduce((a, b) => a + b, 0);
        const count = values.length;
        lines.push(`gateway_session_duration_seconds_sum ${sum}`);
        lines.push(`gateway_session_duration_seconds_count ${count}`);

        // Buckets
        const buckets = [1, 5, 10, 30, 60, 300, 600];
        let cumulative = 0;
        for (const bucket of buckets) {
          cumulative += values.filter((v) => v <= bucket).length;
          lines.push(`gateway_session_duration_seconds_bucket{le="${bucket}"} ${cumulative}`);
        }
        lines.push(`gateway_session_duration_seconds_bucket{le="+Inf"} ${count}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  private formatLabels(key: string): string {
    const parts = key.split('{');
    if (parts.length > 1) {
      return '{' + parts[1];
    }
    return '';
  }

  /**
   * Limpa todas as métricas
   */
  clear(): void {
    this.counters.clear();
    this.histograms.clear();
    this.labels.clear();
  }

  // Convenience methods
  webhooksTotal(event: string): void {
    this.incCounter('webhooks_total', { event });
  }

  webhookFailures(event: string): void {
    this.incCounter('webhook_failures', { event });
  }

  httpRequest(method: string, path: string, status: number): void {
    const pathLabel = path.replace(/\/api\/[\w-]+/g, '/api/:resource');
    this.incCounter('requests', { method, path: pathLabel, status: String(status) });
  }

  auditEvent(eventType: string): void {
    this.incCounter('audit_events', { type: eventType });
  }

  sessionDuration(seconds: number): void {
    this.observeHistogram('session_duration', seconds);
  }
}

export const metrics = new MetricsCollector();
export default metrics;