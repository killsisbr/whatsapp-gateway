import { v4 as uuid } from "uuid";
import { createHmac, randomBytes } from "crypto";
import type { WebhookEvent, WebhookPayload, WebhookRegistration } from "./types.js";

export interface SignedWebhookPayload extends WebhookPayload {
  signature: string;      // HMAC-SHA256 signature
  timestamp: number;      // Unix timestamp (ms)
  nonce: string;          // Unique nonce para prevenir replay
  secret?: string;        // Secret usado para assinatura (apenas para debug)
}

export class WebhookManager {
  private registrations: Map<string, WebhookRegistration> = new Map();
  private failedDeliveries: Array<{ webhookId: string; payload: WebhookPayload; error: string; timestamp: string }> = [];

  register(project: string, url: string, events: WebhookEvent[], secret?: string): WebhookRegistration {
    const existing = [...this.registrations.values()].find(
      (r) => r.project === project && r.url === url
    );
    if (existing) return existing;

    const reg: WebhookRegistration & { secret?: string } = {
      id: uuid(),
      url,
      project,
      events,
      createdAt: new Date().toISOString(),
      secret: secret || randomBytes(32).toString("hex"), // Gera secret se não fornecido
    };
    this.registrations.set(reg.id, reg as WebhookRegistration);
    return reg as WebhookRegistration;
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

  /**
   * Gera assinatura HMAC-SHA256 para o payload
   */
  private generateSignature(payload: unknown, secret: string, timestamp: number, nonce: string): string {
    const payloadStr = JSON.stringify(payload);
    const message = `${timestamp}:${nonce}:${payloadStr}`;
    return createHmac("sha256", secret).update(message).digest("hex");
  }

  async dispatch(event: WebhookEvent, data: unknown) {
    const targets = [...this.registrations.values()].filter((r) =>
      r.events.includes(event)
    );

    const basePayload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const reg of targets) {
      try {
        const timestamp = Date.now();
        const nonce = randomBytes(16).toString("hex");
        const secret = (reg as any).secret || "default-secret";

        // Payload assinado
        const signedPayload: SignedWebhookPayload = {
          ...basePayload,
          signature: this.generateSignature(basePayload, secret, timestamp, nonce),
          timestamp,
          nonce,
        };

        // Headers com assinatura
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signedPayload.signature,
          "X-Webhook-Timestamp": timestamp.toString(),
          "X-Webhook-Nonce": nonce,
          "X-Webhook-Event": event,
        };

        // Adiciona secret apenas para debug (pode ser desativado em produção)
        if (process.env.DEBUG_WEBHOOKS === "true") {
          signedPayload.secret = secret;
        }

        const res = await fetch(reg.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...signedPayload,
            project: reg.project,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.failedDeliveries.push({
          webhookId: reg.id,
          payload: { ...basePayload, project: reg.project },
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

  // Direct dispatch to a single URL (used by tenant webhooks)
  async dispatchToUrl(url: string, event: WebhookEvent, data: unknown, tenantId: string): Promise<boolean> {
    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, tenantId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.failedDeliveries.push({
        webhookId: `tenant:${tenantId}`,
        payload,
        error,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }
}
