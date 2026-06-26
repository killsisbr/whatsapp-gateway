import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import EventEmitter from "node:events";
import path from "node:path";
import pino from "pino";
import qrcode from "qrcode";
import type { ConnectionState } from "./types.js";

export class WhatsAppManager extends EventEmitter {
  private sock: WASocket | null = null;
  private _state: ConnectionState = "disconnected";
  private _phone: string | null = null;
  private _qrString: string | null = null;
  private _qrBase64: string | null = null;
  private logger = pino({ level: "info", transport: { target: "pino-pretty" } });
  private sessionDir: string;

  constructor(sessionDir?: string) {
    super();
    this.sessionDir = sessionDir ?? path.resolve(process.cwd(), "session");
  }

  get state() {
    return this._state;
  }
  get phone() {
    return this._phone;
  }
  get qrString() {
    return this._qrString;
  }
  get qrBase64() {
    return this._qrBase64;
  }
  get connected() {
    return this._state === "connected";
  }
  get qrPending() {
    return this._state === "qr_ready";
  }
  get lastSeen() {
    return this._phone ? new Date() : null;
  }
  get socket(): WASocket | null {
    return this.sock;
  }

  /** Request a pairing code (8-digit) instead of QR scan */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.sock) throw new Error("Socket not initialized — call start() first");
    const code = await this.sock.requestPairingCode(phoneNumber);
    return code;
  }

  async start() {
    this.setState("connecting");
    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.info(`Baileys v${version.join(".")} (latest: ${isLatest})`);

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: this.logger,
      browser: ["WhatsApp Gateway", "Chrome", "1.0.0"],
      syncFullHistory: false,
    });

    // QR event
    this.sock.ev.on("connection.update", async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        this._qrString = qr;
        this._qrBase64 = await qrcode.toDataURL(qr, { width: 300 });
        this.setState("qr_ready");
        this.emit("qr", qr);
      }

      if (connection === "open") {
        const phone = this.sock?.user?.id?.split(":")[0] ?? null;
        this._phone = phone ? `55${phone}` : null;
        this.setState("connected");
        this.emit("connected", this._phone ?? "unknown");
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect =
          reason !== DisconnectReason.loggedOut;

        this.logger.info(
          `Disconnected. Reason: ${reason ?? "unknown"} Reconnect: ${shouldReconnect}`
        );

        if (shouldReconnect) {
          this.start();
        } else {
          this.setState("disconnected");
          this.emit("disconnected", String(reason));
        }
      }
    });

    // Credentials save
    this.sock.ev.on("creds.update", saveCreds);

    // Messages
    this.sock.ev.on("messages.upsert", (events) => {
      for (const msg of events.messages) {
        if (msg.key?.fromMe) continue;
        this.emit("message", msg);
      }
    });
  }

  async sendMessage(to: string, text: string, quoted?: WAMessage) {
    if (!this.sock) throw new Error("Socket not initialized");
    const jid = `${to}@s.whatsapp.net`;
    return this.sock.sendMessage(jid, { text }, { quoted });
  }

  async stop() {
    this.setState("disconnecting");
    this.sock?.end(undefined);
    this.sock = null;
    this.setState("disconnected");
  }

  private setState(s: ConnectionState) {
    this._state = s;
    this.emit("state", s);
  }
}
