import { v4 as uuid } from "uuid";
import type { WebhookEvent, WebhookPayload, WebhookRegistration } from "./types.js";

export class WebhookManager {
  private registrations: Map<string, WebhookRegistration> = new Map();
  private failedDeliveries: Array<{ webhookId: string; payload: WebhookPayload; error: string; timestamp: string }> = [];

  register(project: string, url: string, events: WebhookEvent[]): WebhookRegistration {
    const existing = [...this.registrations.values()].find(
      (r) => r.project === project && r.url === url
    );
    if (existing) return existing;

    const reg: WebhookRegistration = {
      id: uuid(),
      url,
      project,
      events,
      createdAt: new Date().toISOString(),
    };
    this.registrations.set(reg.id, reg);
    return reg;
  }

  remove(id: string): boolean {
    return this.registrations.delete(id);
  }

  list(): WebhookRegistration[] {
    return [...this.registrations.values()];
  }

  get(id: string): WebhookRegistration | undefined {
    return this.registrations.get(id);
  }

  async dispatch(event: WebhookEvent, data: unknown) {
    const targets = [...this.registrations.values()].filter((r) =>
      r.events.includes(event)
    );

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const reg of targets) {
      try {
        const res = await fetch(reg.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, project: reg.project }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.failedDeliveries.push({
          webhookId: reg.id,
          payload,
          error,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  getFailedDeliveries(limit = 50) {
    return this.failedDeliveries.slice(-limit);
  }

  clearFailedDeliveries() {
    this.failedDeliveries = [];
  }
}
