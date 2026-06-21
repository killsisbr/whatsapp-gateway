import { randomBytes } from "crypto";

export interface ApiKey {
  id: string;         // "wha_live_xxxxxxxx"
  tenantId: string;
  name: string;        // "Meu App Android"
  key: string;         // random hex (only shown once at creation)
  createdAt: Date;
  lastUsed?: Date;
  requestCount: number;
}

// Validate an API key and return tenantId if valid
export function parseApiKey(header: string | undefined): { tenantId: string; keyId: string } | null {
  if (!header) return null;
  const parts = header.split("_");
  if (parts.length < 3) return null;
  const tenantId = parts.slice(2, -1).join("_"); // everything between "wha" and "live"
  const keyId = header;
  return { tenantId, keyId };
}

export function generateApiKey(tenantId: string): ApiKey {
  const id = `wha_live_${tenantId.slice(0, 8)}_${randomBytes(12).toString("hex").slice(0, 16)}`;
  return {
    id,
    tenantId,
    name: "Default",
    key: randomBytes(32).toString("hex"),
    createdAt: new Date(),
    requestCount: 0,
  };
}