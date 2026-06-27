/**
 * Session Token Manager - QR Code com token único e expiração
 *
 * Fluxo:
 * 1. POST /api/session/request → gera sessionToken (UUID) + QR
 * 2. QR expira em 60 segundos (1 uso único)
 * 3. Após scan bem-sucedido → gera tenantId + apiKey criptografada + sessionPassword
 * 4. apiKey é mostrada APENAS UMA VEZ e nunca mais armazenada em claro
 */

import { randomUUID, randomBytes, createHash } from "crypto";

export interface SessionToken {
  id: string;           // UUID do session token
  createdAt: number;    // timestamp de criação
  expiresAt: number;    // timestamp de expiração (60s)
  qrId: string;         // vincula ao QR específico
  tenantId?: string;    // preenchido após sucesso
  used: boolean;        // marcado true após primeiro uso
}

export interface SessionCredentials {
  tenantId: string;
  apiKey: string;           // wha_<tenantId>_<secret> - mostrado 1x
  sessionPassword: string;  // PIN de 6 dígitos para ops críticas
  encryptedApiKey: string;  // apiKey criptografada (armazenada)
}

export class SessionTokenManager {
  private tokens = new Map<string, SessionToken>();
  private readonly TOKEN_TTL = 60 * 1000; // 60 segundos
  private readonly CLEANUP_INTERVAL = 30 * 1000; // 30 segundos

  constructor() {
    // Cleanup automático de tokens expirados
    setInterval(() => this.cleanupExpired(), this.CLEANUP_INTERVAL);
  }

  /**
   * Gera um novo session token para QR
   */
  createToken(qrId?: string): SessionToken {
    const now = Date.now();
    const token: SessionToken = {
      id: randomUUID(),
      createdAt: now,
      expiresAt: now + this.TOKEN_TTL,
      qrId: qrId || randomUUID(),
      used: false,
    };
    this.tokens.set(token.id, token);
    return token;
  }

  /**
   * Valida e consome um session token (1 uso apenas)
   */
  consumeToken(tokenId: string): { valid: boolean; token?: SessionToken; error?: string } {
    const token = this.tokens.get(tokenId);

    if (!token) {
      return { valid: false, error: "Session token não encontrado" };
    }

    if (token.used) {
      this.tokens.delete(tokenId);
      return { valid: false, error: "Session token já utilizado" };
    }

    if (Date.now() > token.expiresAt) {
      this.tokens.delete(tokenId);
      return { valid: false, error: "Session token expirado" };
    }

    // Token válido - marcar como usado
    token.used = true;
    return { valid: true, token };
  }

  /**
   * Gera credenciais completas para um tenant
   *
   * Gera:
   * - tenantId: UUID curto (8 chars)
   * - apiKey: formato wha_<tenantId>_<secret32> (mostrado 1x)
   * - sessionPassword: PIN 6 dígitos para ops críticas
   * - encryptedApiKey: apiKey criptografada para armazenamento
   */
  generateCredentials(existingTenantId?: string): SessionCredentials {
    const tenantId = existingTenantId || this.generateShortTenantId();
    const secretKey = randomBytes(16).toString("hex"); // 32 chars hex
    const apiKey = `wha_${tenantId}_${secretKey}`;
    const sessionPassword = this.generateSessionPassword();

    // Criptografar apiKey para armazenamento (chave fixa do server)
    const encryptionKey = process.env.API_KEY_SECRET || "gateway-default-key-change-me";
    const encryptedApiKey = this.simpleEncrypt(apiKey, encryptionKey);

    return {
      tenantId,
      apiKey,      // ⚠️ MOSTRAR APENAS UMA VEZ AO USUÁRIO
      sessionPassword,
      encryptedApiKey,
    };
  }

  /**
   * Gera tenantId curto (8 chars alfanuméricos)
   */
  private generateShortTenantId(): string {
    return randomBytes(8)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 8)
      .toLowerCase();
  }

  /**
   * Gera PIN de 6 dígitos para operações críticas
   */
  private generateSessionPassword(): string {
    // Garante 6 dígitos numéricos
    const num = parseInt(randomBytes(3).toString("hex").slice(0, 6), 16);
    return (num % 1000000).toString().padStart(6, "0");
  }

  /**
   * Criptografia simples (XOR + base64) para armazenamento
   * ⚠️ Em produção, usar AES-256-GCM com crypto.subtle ou libsodium
   */
  private simpleEncrypt(plainText: string, key: string): string {
    const keyHash = createHash("sha256").update(key).digest();
    const result = [];

    for (let i = 0; i < plainText.length; i++) {
      const charCode = plainText.charCodeAt(i) ^ keyHash[i % keyHash.length];
      result.push(String.fromCharCode(charCode));
    }

    return Buffer.from(result.join("")).toString("base64");
  }

  /**
   * Descriptografia para validação de API key
   */
  private simpleDecrypt(encrypted: string, key: string): string {
    const encryptedBuffer = Buffer.from(encrypted, "base64");
    const encryptedStr = encryptedBuffer.toString("utf-8");
    const keyHash = createHash("sha256").update(key).digest();
    const result = [];

    for (let i = 0; i < encryptedStr.length; i++) {
      const charCode = encryptedStr.charCodeAt(i) ^ keyHash[i % keyHash.length];
      result.push(String.fromCharCode(charCode));
    }

    return result.join("");
  }

  /**
   * Valida API key no formato wha_<tenantId>_<secret>
   */
  validateApiKey(apiKey: string, storedEncryptedKey: string): boolean {
    try {
      const encryptionKey = process.env.API_KEY_SECRET || "gateway-default-key-change-me";
      const decryptedKey = this.simpleDecrypt(storedEncryptedKey, encryptionKey);
      return apiKey === decryptedKey;
    } catch {
      return false;
    }
  }

  /**
   * Parse API key para extrair tenantId
   */
  parseApiKey(apiKey: string): { tenantId: string; secret: string } | null {
    const parts = apiKey.split("_");
    if (parts.length < 3 || parts[0] !== "wha") {
      return null;
    }
    const tenantId = parts[1];
    const secret = parts.slice(2).join("_");
    return { tenantId, secret };
  }

  /**
   * Limpa tokens expirados
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, token] of this.tokens.entries()) {
      if (now > token.expiresAt || token.used) {
        this.tokens.delete(id);
      }
    }
  }

  /**
   * Stats para monitoring
   */
  getStats(): { total: number; active: number; expired: number } {
    const now = Date.now();
    let active = 0;
    let expired = 0;

    for (const token of this.tokens.values()) {
      if (token.used || now > token.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.tokens.size,
      active,
      expired,
    };
  }
}

// Singleton export
export const sessionTokenManager = new SessionTokenManager();
export default sessionTokenManager;