import type { BaileysEventMap, WAMessage } from "@whiskeysockets/baileys";

export interface WebhookRegistration {
  id: string;
  url: string;
  project: string;
  events: WebhookEvent[];
  createdAt: string;
}

export type WebhookEvent = "message" | "status" | "qr" | "disconnect";

export interface WebhookPayload {
  event: WebhookEvent;
  project?: string;
  data: unknown;
  timestamp: string;
}

export interface QrResponse {
  qr: string;       // base64 PNG
  qrString: string; // raw string for terminal
  expires: number;
}

export interface StatusResponse {
  connected: boolean;
  state: string;
  phone?: string;
  lastSeen?: string;
  qrPending: boolean;
}

export interface SendRequest {
  to: string;           // "5511999999999"
  text: string;
  project?: string;     // optional project identifier
  quotedMessageId?: string;
}

export interface SendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type ConnectionState =
  | "connecting"
  | "qr_ready"
  | "connected"
  | "disconnecting"
  | "disconnected";
