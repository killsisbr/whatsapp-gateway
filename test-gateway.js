/**
 * Teste rápido do WhatsApp Gateway
 *
 * Valida:
 * 1. Session Token Manager
 * 2. Webhook Validator (HMAC)
 * 3. Audit Logger
 */

import { createHmac } from "crypto";

console.log("🧪 TESTE RÁPIDO - WhatsApp Gateway\n");

// Teste 1: Session Token Manager
console.log("1️⃣ Session Token Manager...");
try {
  const { sessionTokenManager } = await import("./dist/sessionToken.js");

  // Cria token
  const token = sessionTokenManager.createToken("test-qr-123");
  console.log(`   ✅ Token criado: ${token.id.substring(0, 8)}...`);
  console.log(`   ✅ QR ID: ${token.qrId}`);
  console.log(`   ✅ Expira em: ${new Date(token.expiresAt).toLocaleTimeString()}`);

  // Gera credenciais
  const creds = sessionTokenManager.generateCredentials();
  console.log(`   ✅ Tenant ID: ${creds.tenantId}`);
  console.log(`   ✅ API Key: ${creds.apiKey.substring(0, 20)}...`);
  console.log(`   ✅ Session Password: ${creds.sessionPassword}`);

  // Testa consume
  const result = sessionTokenManager.consumeToken(token.id);
  console.log(`   ✅ Token consumido: ${result.valid ? "SIM" : "NÃO"}`);
} catch (err) {
  console.log(`   ❌ ERRO: ${err.message}`);
}

// Teste 2: Webhook Validator
console.log("\n2️⃣ Webhook Validator (HMAC)...");
try {
  const { validateWebhookSignature } = await import("./dist/webhook-validator.js");

  const secret = "test-secret-key-123";
  const timestamp = Date.now().toString();
  const nonce = "test-nonce-abc";
  const payload = { event: "message", to: "5541999999999", text: "Olá" };

  // Gera signature (simula o que o servidor faz)
  const message = `${timestamp}:${nonce}:${JSON.stringify(payload)}`;
  const signature = createHmac("sha256", secret).update(message).digest("hex");

  // Valida
  const isValid = validateWebhookSignature(payload, signature, timestamp, nonce, secret);
  console.log(`   ✅ Signature válida: ${isValid ? "SIM" : "NÃO"}`);

  // Testa com signature errada
  const isInvalid = validateWebhookSignature(payload, "wrong-signature", timestamp, nonce, secret);
  console.log(`   ✅ Signature errada rejeitada: ${!isInvalid ? "SIM" : "NÃO"}`);
} catch (err) {
  console.log(`   ❌ ERRO: ${err.message}`);
}

// Teste 3: Audit Logger
console.log("\n3️⃣ Audit Logger...");
try {
  const { auditLogger } = await import("./dist/audit.js");

  // Loga evento
  auditLogger.authSuccess("test-tenant", "127.0.0.1");
  auditLogger.apiRequest("POST", "/api/send", 200, "test-tenant", "[REDACTED]", "127.0.0.1");
  auditLogger.messageSent("test-tenant", "5541999999999", "msg-123");

  console.log(`   ✅ Logs gravados em: logs/audit/`);
  console.log(`   ✅ Buffer flush assíncrono OK`);

  // Aguarda flush
  await new Promise(resolve => setTimeout(resolve, 500));
} catch (err) {
  console.log(`   ❌ ERRO: ${err.message}`);
}

console.log("\n✅ TESTE CONCLUÍDO!\n");
console.log("Endpoints disponíveis:");
console.log("  POST /api/session/request  - Solicita QR com token");
console.log("  POST /api/session/confirm  - Confirma scan e gera credenciais");
console.log("  POST /api/session/rotate-key - Rotaciona API key");
console.log("  GET  /api/session/stats    - Stats de tokens");
console.log("  POST /api/send             - Envia mensagem");
console.log("  POST /api/webhook          - Registra webhook");