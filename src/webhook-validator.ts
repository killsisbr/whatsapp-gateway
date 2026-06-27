import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook Signature Validator
 *
 * Utility para validar assinaturas HMAC-SHA256 de webhooks recebidos.
 *
 * Uso no seu projeto:
 *
 * ```ts
 * import { validateWebhookSignature } from "./webhook-validator";
 *
 * app.post("/webhook", (req, res) => {
 *   const signature = req.headers["x-webhook-signature"] as string;
 *   const timestamp = req.headers["x-webhook-timestamp"] as string;
 *   const nonce = req.headers["x-webhook-nonce"] as string;
 *   const payload = req.body;
 *
 *   const isValid = validateWebhookSignature(payload, signature, timestamp, nonce, YOUR_WEBHOOK_SECRET);
 *
 *   if (!isValid) {
 *     return res.status(401).json({ error: "Invalid signature" });
 *   }
 *
 *   // Payload é válido, processe...
 * });
 * ```
 */

export interface WebhookHeaders {
  "x-webhook-signature": string;
  "x-webhook-timestamp": string;
  "x-webhook-nonce": string;
  "x-webhook-event"?: string;
}

/**
 * Valida a assinatura HMAC de um webhook recebido
 *
 * @param payload - O payload recebido (req.body)
 * @param signature - Assinatura recebida no header X-Webhook-Signature
 * @param timestamp - Timestamp recebido no header X-Webhook-Timestamp
 * @param nonce - Nonce recebido no header X-Webhook-Nonce
 * @param secret - Secret do webhook (mesmo usado no gateway)
 * @param tolerance - Tolerância em ms para timestamp (padrão: 5 minutos)
 *
 * @returns true se a assinatura é válida e dentro do tempo
 */
export function validateWebhookSignature(
  payload: unknown,
  signature: string,
  timestamp: string,
  nonce: string,
  secret: string,
  tolerance: number = 5 * 60 * 1000 // 5 minutos
): boolean {
  try {
    // Valida timestamp (previne replay attacks antigos)
    const now = Date.now();
    const webhookTime = parseInt(timestamp, 10);

    if (isNaN(webhookTime)) {
      return false;
    }

    if (Math.abs(now - webhookTime) > tolerance) {
      return false; // Webhook muito antigo ou do futuro
    }

    // Recria a assinatura
    const payloadStr = JSON.stringify(payload);
    const message = `${timestamp}:${nonce}:${payloadStr}`;
    const expectedSignature = createHmac("sha256", secret).update(message).digest("hex");

    // Comparação segura (previne timing attacks)
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
}

/**
 * Extrai headers de assinatura de um objeto Request (Express, Fastify, etc.)
 *
 * @param headers - Headers da requisição (case-insensitive)
 * @returns Headers normalizados ou null se ausentes
 */
export function extractWebhookHeaders(headers: Record<string, string | undefined>): WebhookHeaders | null {
  // Normaliza headers (case-insensitive)
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value || "";
  }

  const signature = normalized["x-webhook-signature"];
  const timestamp = normalized["x-webhook-timestamp"];
  const nonce = normalized["x-webhook-nonce"];

  if (!signature || !timestamp || !nonce) {
    return null;
  }

  return {
    "x-webhook-signature": signature,
    "x-webhook-timestamp": timestamp,
    "x-webhook-nonce": nonce,
    "x-webhook-event": normalized["x-webhook-event"],
  };
}

/**
 * Gera um secret aleatório para webhooks (32 bytes hex = 64 chars)
 */
export function generateWebhookSecret(): string {
  const { randomBytes } = require("crypto");
  return randomBytes(32).toString("hex");
}

export default {
  validateWebhookSignature,
  extractWebhookHeaders,
  generateWebhookSecret,
};