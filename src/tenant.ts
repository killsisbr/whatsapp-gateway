import { WebhookManager } from "./webhook.js";
import { ApiKey, generateApiKey } from "./apiKeys.js";
import { Store, StoredTenant, StoredApiKey } from "./store.js";

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
  // stats
  messagesSent: number;
  messagesReceived: number;
  messagesFailed: number;
  qrScans: number;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
}

export class TenantManager {
  private tenants = new Map<string, Tenant>();
  private whatsappManagers = new Map<string, any>();
  private webhookManager = new WebhookManager();
  private store: Store;

  constructor(store?: Store) {
    this.store = store || new Store();
    this.loadFromStore();
  }

  private loadFromStore() {
    const storedTenants = this.store.loadTenants();
    for (const t of storedTenants) {
      const tenant: Tenant = {
        ...t,
        createdAt: new Date(t.createdAt),
        lastSeen: t.lastSeen ? new Date(t.lastSeen) : undefined,
        lastConnectedAt: t.lastConnectedAt ? new Date(t.lastConnectedAt) : undefined,
        lastDisconnectedAt: t.lastDisconnectedAt ? new Date(t.lastDisconnectedAt) : undefined,
      };
      this.tenants.set(tenant.id, tenant);
    }
    const storedKeys = this.store.loadApiKeys();
    for (const k of storedKeys) {
      const key: ApiKey = { ...k, createdAt: new Date(k.createdAt), lastUsed: k.lastUsed ? new Date(k.lastUsed) : undefined };
      this.apiKeys.set(key.id, key);
    }
  }

  private saveToStore() {
    const tenants: StoredTenant[] = Array.from(this.tenants.values()).map(t => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      lastSeen: t.lastSeen?.toISOString(),
      lastConnectedAt: t.lastConnectedAt?.toISOString(),
      lastDisconnectedAt: t.lastDisconnectedAt?.toISOString(),
    }));
    this.store.saveTenants(tenants);

    const apiKeys: StoredApiKey[] = Array.from(this.apiKeys.values()).map(k => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      lastUsed: k.lastUsed?.toISOString(),
    }));
    this.store.saveApiKeys(apiKeys);
  }

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
      messagesSent: 0,
      messagesReceived: 0,
      messagesFailed: 0,
      qrScans: 0,
    };
    this.tenants.set(id, tenant);
    this.saveToStore();
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
    const deleted = this.tenants.delete(tenantId);
    this.saveToStore();
    return deleted;
  }

  updateWebhook(userId: string, tenantId: string, url: string, events: string[]): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || t.userId !== userId) return false;
    t.webhookUrl = url;
    t.webhookEvents = events;
    this.saveToStore();
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
    if (!t?.webhookUrl) return;
    this.webhookManager.dispatchToUrl(t.webhookUrl, event, data, tenantId);
  }

  // --- API Keys ---
  private apiKeys = new Map<string, ApiKey>();

  createApiKey(tenantId: string, name: string): ApiKey {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("tenant not found");
    const key = generateApiKey(tenantId);
    key.name = name;
    this.apiKeys.set(key.id, key);
    this.saveToStore();
    return key;
  }

  listApiKeys(tenantId: string): Omit<ApiKey, "key">[] {
    return Array.from(this.apiKeys.values())
      .filter(k => k.tenantId === tenantId)
      .map(({ key: _, ...pub }) => pub);
  }

  deleteApiKey(tenantId: string, keyId: string): boolean {
    const k = this.apiKeys.get(keyId);
    if (!k || k.tenantId !== tenantId) return false;
    const deleted = this.apiKeys.delete(keyId);
    this.saveToStore();
    return deleted;
  }

  validateApiKey(keyId: string): { tenantId: string } | null {
    const k = this.apiKeys.get(keyId);
    if (!k) return null;
    k.requestCount++;
    k.lastUsed = new Date();
    this.saveToStore();
    return { tenantId: k.tenantId };
  }

  // --- Stats ---
  incMessageSent(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (t) { t.messagesSent++; this.saveToStore(); }
  }

  incMessageReceived(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (t) { t.messagesReceived++; this.saveToStore(); }
  }

  incMessageFailed(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (t) { t.messagesFailed++; this.saveToStore(); }
  }

  incQrScan(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (t) { t.qrScans++; this.saveToStore(); }
  }

  markConnected(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (t) { t.lastConnectedAt = new Date(); this.saveToStore(); }
  }

  markDisconnected(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (t) { t.lastDisconnectedAt = new Date(); this.saveToStore(); }
  }
}