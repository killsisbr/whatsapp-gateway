import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

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

function loadJson<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filename: string, data: unknown) {
  ensureDataDir();
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export class Store {
  // --- Users ---
  loadUsers(): StoredUser[] {
    return loadJson("users.json", []);
  }

  saveUsers(users: StoredUser[]) {
    saveJson("users.json", users);
  }

  // --- Tenants ---
  loadTenants(): StoredTenant[] {
    return loadJson("tenants.json", []);
  }

  saveTenants(tenants: StoredTenant[]) {
    saveJson("tenants.json", tenants);
  }

  // --- API Keys ---
  loadApiKeys(): StoredApiKey[] {
    return loadJson("apikeys.json", []);
  }

  saveApiKeys(apiKeys: StoredApiKey[]) {
    saveJson("apikeys.json", apiKeys);
  }
}