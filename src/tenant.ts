import { WebhookManager } from "./webhook.js";
import { ApiKey, generateApiKey } from "./apiKeys.js";
import { Store, StoredTenant, StoredApiKey } from "./store.js";
import { sessionTokenManager } from "./sessionToken.js";

export interface Device {
  phoneNumber: string;
  sessionPath: string;
  connected: boolean;
  state: "disconnected" | "qr_ready" | "connecting" | "connected" | "logged_out";
  lastSeen?: Date;
}

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
  // Multi-device support
  devices?: Device[];
  // IP Whitelist (opcional)
  ipWhitelist?: string[];
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
      const key: ApiKey & { encryptedKey?: string } = { 
        ...k, 
        encryptedKey: k.key, 
        createdAt: new Date(k.createdAt), 
        lastUsed: k.lastUsed ? new Date(k.lastUsed) : undefined 
      };
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

  // --- API Keys Criptografadas ---
  private apiKeys = new Map<string, ApiKey & { encryptedKey?: string }>();

  /**
   * Cria API key usando o gerador do SessionTokenManager (criptografada)
   *
   * Retorna a API key EM CLARO apenas uma vez para o usuário!
   */
  createApiKey(tenantId: string, name: string): { key: ApiKey; plainApiKey?: string; encryptedKey: string } {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("tenant not found");

    // Gera credenciais criptografadas
    const credentials = sessionTokenManager.generateCredentials(tenantId);

    const key: ApiKey & { encryptedKey?: string } = {
      id: credentials.tenantId, // Usa tenantId como ID
      tenantId: credentials.tenantId,
      key: credentials.encryptedApiKey, // Armazena apenas criptografado
      encryptedKey: credentials.encryptedApiKey,
      name,
      createdAt: new Date(),
      requestCount: 0,
    };

    this.apiKeys.set(key.id, key);
    this.saveToStore();

    // Retorna chave em claro APENAS UMA VEZ
    return {
      key: { ...key, key: "" }, // Não expõe a chave em claro no return type
      plainApiKey: credentials.apiKey, // ⚠️ ÚNICA VEZ QUE APARECE!
      encryptedKey: credentials.encryptedApiKey,
    };
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

  /**
   * Valida API key no formato wha_<tenantId>_<secret>
   */
  validateApiKey(plainApiKey: string): { tenantId: string } | null {
    // Parse da API key
    const parsed = sessionTokenManager.parseApiKey(plainApiKey);
    if (!parsed) return null;

    const key = this.apiKeys.get(parsed.tenantId);
    if (!key || !key.encryptedKey) return null;

    // Valida com criptografia
    const isValid = sessionTokenManager.validateApiKey(plainApiKey, key.encryptedKey);
    if (!isValid) return null;

    // Stats
    key.requestCount++;
    key.lastUsed = new Date();
    this.saveToStore();

    return { tenantId: parsed.tenantId };
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

  // --- Multi-Device Support ---

  /**
   * Adiciona um dispositivo ao tenant
   */
  addDevice(tenantId: string, phoneNumber: string): Device | null {
    const t = this.tenants.get(tenantId);
    if (!t) return null;

    if (!t.devices) t.devices = [];

    const device: Device = {
      phoneNumber,
      sessionPath: `sessions/${tenantId}/${phoneNumber}`,
      connected: false,
      state: "disconnected",
    };

    t.devices.push(device);
    this.saveToStore();
    return device;
  }

  /**
   * Lista dispositivos de um tenant
   */
  listDevices(tenantId: string): Device[] {
    const t = this.tenants.get(tenantId);
    return t?.devices || [];
  }

  /**
   * Remove um dispositivo do tenant
   */
  removeDevice(tenantId: string, phoneNumber: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || !t.devices) return false;

    const index = t.devices.findIndex(d => d.phoneNumber === phoneNumber);
    if (index === -1) return false;

    t.devices.splice(index, 1);
    this.saveToStore();
    return true;
  }

  /**
   * Atualiza estado de um dispositivo
   */
  updateDeviceState(tenantId: string, phoneNumber: string, updates: Partial<Device>): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || !t.devices) return false;

    const device = t.devices.find(d => d.phoneNumber === phoneNumber);
    if (!device) return false;

    Object.assign(device, updates);
    this.saveToStore();
    return true;
  }

  // --- IP Whitelist Support ---

  /**
   * Define IP whitelist para um tenant
   */
  setIpWhitelist(tenantId: string, ips: string[]): boolean {
    const t = this.tenants.get(tenantId);
    if (!t) return false;

    t.ipWhitelist = ips;
    this.saveToStore();
    return true;
  }

  /**
   * Verifica se um IP está na whitelist
   */
  isIpAllowed(tenantId: string, ip: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || !t.ipWhitelist || t.ipWhitelist.length === 0) {
      return true; // Sem whitelist = todos os IPs permitidos
    }

    // Verifica IP exato ou CIDR
    return t.ipWhitelist.some(allowed => {
      if (allowed === ip) return true;

      // CIDR match (simplificado)
      if (allowed.includes('/')) {
        const [base, mask] = allowed.split('/');
        const maskBits = parseInt(mask, 10);
        return ip.startsWith(base.split('.').slice(0, Math.ceil(maskBits / 8)).join('.'));
      }

      return false;
    });
  }

  /**
   * Adiciona IP à whitelist
   */
  addIpToWhitelist(tenantId: string, ip: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t) return false;

    if (!t.ipWhitelist) t.ipWhitelist = [];
    if (!t.ipWhitelist.includes(ip)) {
      t.ipWhitelist.push(ip);
      this.saveToStore();
    }
    return true;
  }

  /**
   * Remove IP da whitelist
   */
  removeIpFromWhitelist(tenantId: string, ip: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t || !t.ipWhitelist) return false;

    const index = t.ipWhitelist.indexOf(ip);
    if (index === -1) return false;

    t.ipWhitelist.splice(index, 1);
    this.saveToStore();
    return true;
  }

  /**
   * Limpa IP whitelist
   */
  clearIpWhitelist(tenantId: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t) return false;

    t.ipWhitelist = [];
    this.saveToStore();
    return true;
  }
}