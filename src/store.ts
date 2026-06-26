import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, "..", "data");

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string; // ISO string for JSON
}

export interface StoredTenant {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  connected: boolean;
  state: "disconnected" | "qr_ready" | "connecting" | "connected" | "logged_out";
  webhookUrl?: string;
  webhookEvents: string[];
  createdAt: string;
  lastSeen?: string;
  // stats
  messagesSent: number;
  messagesReceived: number;
  messagesFailed: number;
  qrScans: number;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
}

export interface TenantStats {
  messagesSent: number;
  messagesReceived: number;
  messagesFailed: number;
  qrScans: number;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
}

export interface StoredApiKey {
  id: string;
  tenantId: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
  requestCount: number;
}

export interface StoreData {
  users: StoredUser[];
  tenants: StoredTenant[];
  apiKeys: StoredApiKey[];
}

export class Store {
  private DATA_DIR: string;

  constructor(dataDir?: string) {
    this.DATA_DIR = dataDir || DEFAULT_DATA_DIR;
  }

  private ensureDataDir() {
    if (!existsSync(this.DATA_DIR)) {
      mkdirSync(this.DATA_DIR, { recursive: true });
    }
  }

  private loadJson<T>(filename: string, fallback: T): T {
    this.ensureDataDir();
    const path = join(this.DATA_DIR, filename);
    if (!existsSync(path)) return fallback;
    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private saveJson(filename: string, data: unknown) {
    this.ensureDataDir();
    const path = join(this.DATA_DIR, filename);
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  }
  // --- Users ---
  loadUsers(): StoredUser[] {
    return this.loadJson("users.json", []);
  }

  saveUsers(users: StoredUser[]) {
    this.saveJson("users.json", users);
  }

  // --- Tenants ---
  loadTenants(): StoredTenant[] {
    return this.loadJson("tenants.json", []);
  }

  saveTenants(tenants: StoredTenant[]) {
    this.saveJson("tenants.json", tenants);
  }

  // --- API Keys ---
  loadApiKeys(): StoredApiKey[] {
    return this.loadJson("apikeys.json", []);
  }

  saveApiKeys(apiKeys: StoredApiKey[]) {
    this.saveJson("apikeys.json", apiKeys);
  }
}