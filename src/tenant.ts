import { WebhookManager } from "./webhook.js";

export interface Tenant {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  connected: boolean;
  state: "disconnected" | "qr_ready" | "connecting" | "connected" | "logged_out";
  webhookUrl?: string;
  webhookEvents: string[];
  createdAt: Date;
  lastSeen?: Date;
}

export class TenantManager {
  private tenants = new Map<string, Tenant>();
  private whatsappManagers = new Map<string, any>();
  private webhookManager = new WebhookManager();

  register(userId: string, name: string): Tenant {
    const id = crypto.randomUUID();
    const tenant: Tenant = {
      id,
      userId,
      name,
      connected: false,
      state: "disconnected",
      webhookEvents: ["message", "status", "disconnect", "qr"],
      createdAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  get(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  getForUser(userId: string, tenantId: string): Tenant | undefined {
    const t = this.tenants.get(tenantId);
    if (!t || t.userId !== userId) return undefined;
    return t;
  }

  listForUser(userId: string): Tenant[] {
    return Array.from(this.tenants.values()).filter(t => t.userId === userId);
  }

  count(): number {
    return this.tenants.size;
  }

  remove(userId: string, tenantId: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || t.userId !== userId) return false;
    const manager = this.whatsappManagers.get(tenantId);
    if (manager) { manager.disconnect?.(); this.whatsappManagers.delete(tenantId); }
    return this.tenants.delete(tenantId);
  }

  updateWebhook(userId: string, tenantId: string, url: string, events: string[]): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || t.userId !== userId) return false;
    t.webhookUrl = url;
    t.webhookEvents = events;
    return true;
  }

  setWhatsAppManager(tenantId: string, manager: any): void {
    this.whatsappManagers.set(tenantId, manager);
  }

  getWhatsAppManager(tenantId: string): any {
    return this.whatsappManagers.get(tenantId);
  }

  getWebhookManager(): WebhookManager {
    return this.webhookManager;
  }

  dispatchToTenant(tenantId: string, event: "message" | "status" | "disconnect" | "qr", data: unknown): void {
    const t = this.tenants.get(tenantId);
    if (t?.webhookUrl) {
      this.webhookManager.dispatch(event, { ...data as object, tenantId });
    }
  }
}