# WhatsApp Gateway

**Centralized WhatsApp API — one Baileys socket, multiple consuming projects.**

Instead of running a separate WhatsApp session per project, this gateway maintains a single authenticated socket and exposes it via REST. Projects register webhooks to receive incoming messages and call the send endpoint to push messages out.

> **Why:** WhatsApp sessions are phone-bound. Running one socket per project means one of them has to stay connected — and reconnecting is slow (QR scan every time). This gateway solves that by scanning once and sharing the connection.

---

## Architecture

```
                        ┌─────────────────────────────────┐
  Admin scans QR ──────► │        WhatsApp Gateway          │
  once, session         │                                 │
  persists on disk       │  Baileys Socket                 │
                        │  (single session, auto-reconnect)│
                        │                                 │
  Projects ─────────────►│  POST /api/send                 │
  send via API           │  GET  /api/qr                   │
                        │  GET  /api/status                │
  Webhooks ◄────────────│  POST/GET/DELETE /api/webhook   │
  receive messages       └─────────────────────────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼              ▼
               Projeto A      Projeto B      Projeto C
            (webhook url)  (webhook url)  (webhook url)
```

**Key properties:**
- Session persists to `session/` folder — survives restarts, no re-scan needed
- Auto-reconnect on disconnect (except `loggedOut`, which requires new scan)
- All incoming messages dispatched to registered webhooks
- Projects never interact with Baileys directly — HTTP only

---

## Quick Start

### 1. Install & Run

```bash
cd D:\WHATSAPP-GATEWAY
npm install
npm run dev
```

### 2. Scan QR

Open `http://localhost:3000/api/qr` in a browser — it's a base64 PNG image. Scan with WhatsApp (Linked Devices → Link a Device).

Or in terminal:

```bash
npm run qr    # shows QR in terminal via qrcode-terminal
```

### 3. Verify connection

```bash
curl http://localhost:3000/api/status
# → {"connected":true,"state":"connected","phone":"55119...","qrPending":false}
```

---

## API Reference

Base URL: `http://localhost:3000`

### `GET /health`

Health check + current socket state.

```bash
curl http://localhost:3000/health
```

```json
{
  "ok": true,
  "state": "connected",
  "uptime": 3600
}
```

---

### `GET /api/qr`

Returns current QR code (only valid when not connected).

```json
{
  "status": "qr_ready",
  "qr": "data:image/png;base64,...",
  "qrTerminal": "2@ABC123...encryptedstring...",
  "expires": 1750531000000
}
```

If already connected:
```json
{ "status": "already_connected", "phone": "5511999999999" }
```

---

### `GET /api/status`

Connection status for monitoring tools.

```json
{
  "connected": true,
  "state": "connected",
  "phone": "5511999999999",
  "lastSeen": "2026-06-21T12:00:00.000Z",
  "qrPending": false
}
```

---

### `POST /api/send`

Send a text message through the shared socket.

**Request:**
```json
{
  "to": "5511999999999",
  "text": "Hello from the gateway!",
  "project": "saas-roupas"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | ✅ | Full phone number with country code (no spaces or chars) |
| `text` | string | ✅ | Message body |
| `project` | string | no | Optional label for logging/audit |

**Success response:**
```json
{
  "success": true,
  "messageId": "BAEK1234567890ABCD",
  "project": "saas-roupas"
}
```

**Failure (not connected):**
```json
{
  "success": false,
  "error": "WhatsApp not connected. Scan QR first.",
  "state": "qr_ready"
}
```

---

### `POST /api/webhook`

Register a URL to receive events.

**Request:**
```json
{
  "project": "saas-roupas",
  "url": "https://saas-roupas.com/api/whatsapp-webhook",
  "events": ["message", "disconnect"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project` | string | ✅ | Unique identifier for your project |
| `url` | string | ✅ | HTTPS URL that accepts POST |
| `events` | string[] | ✅ | Event types to subscribe to |

**Valid events:** `message`, `status`, `qr`, `disconnect`

**Success response (201):**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "url": "https://saas-roupas.com/api/whatsapp-webhook",
  "project": "saas-roupas",
  "events": ["message", "disconnect"],
  "createdAt": "2026-06-21T12:00:00.000Z"
}
```

---

### `GET /api/webhook`

List all registered webhooks.

```bash
curl http://localhost:3000/api/webhook
```

```json
[
  {
    "id": "a1b2c3d4-...",
    "project": "saas-roupas",
    "url": "https://saas-roupas.com/api/whatsapp-webhook",
    "events": ["message", "disconnect"],
    "createdAt": "2026-06-21T12:00:00.000Z"
  }
]
```

---

### `DELETE /api/webhook/:id`

Remove a webhook registration.

```bash
curl -X DELETE http://localhost:3000/api/webhook/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

```json
{ "success": true, "removed": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

---

### `GET /api/webhook/failed`

View webhook deliveries that failed (network error or non-2xx response). Useful for debugging.

```json
[
  {
    "webhookId": "a1b2c3d4-...",
    "payload": { "event": "message", "data": {...}, "timestamp": "..." },
    "error": "HTTP 502",
    "timestamp": "2026-06-21T12:05:00.000Z"
  }
]
```

---

## Webhook Payload Format

When an event fires, all matching webhooks receive a `POST` with:

```json
{
  "event": "message",
  "project": "saas-roupas",
  "data": {
    "key": { "id": "BAEK...", "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false },
    "message": { "conversation": "Olá!" },
    "pushName": "João",
    "timestamp": 1750531000
  },
  "timestamp": "2026-06-21T12:00:00.000Z"
}
```

**Handling messages in your project:**

```javascript
app.post('/api/whatsapp-webhook', (req, res) => {
  const { event, data, project } = req.body;

  if (event === 'message') {
    const text = data.message?.conversation || data.message?.extendedTextMessage?.text;
    const from = data.key.remoteJid;
    console.log(`[${project}] ${data.pushName}: ${text}`);
    // respond, store, trigger automation...
  }

  res.sendStatus(200); // acknowledge quickly
});
```

---

## How Projects Integrate

### 1. Register a webhook

```bash
curl -X POST http://YOUR_GATEWAY_HOST:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "project": "my-app",
    "url": "https://my-app.com/webhooks/whatsapp",
    "events": ["message"]
  }'
```

### 2. Send messages via API

```bash
curl -X POST http://YOUR_GATEWAY_HOST:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "text": "Your order #1234 has been shipped!",
    "project": "my-app"
  }'
```

### 3. Receive incoming messages

Your webhook URL receives `POST` payloads as shown above. Process asynchronously — acknowledge with 200 immediately, handle in background.

---

## Session Persistence

The session is stored in the `session/` folder (created automatically). This folder contains:
- `creds.json` — authentication credentials (keep private)
- Other auth files

**To move the gateway to a new machine:** copy the entire `session/` folder. No re-scan needed.

**To force a new scan:** delete the `session/` folder and restart.

---

## Environment Variables

```env
PORT=3000                  # server port
BROWSER_NAME=WhatsApp Gateway  # device name shown in WhatsApp
DEFAULT_WEBHOOK_URL=       # optional default webhook
RECONNECT_INTERVAL=5000     # reconnect delay on failure
```

---

## Production Deployment

```bash
npm run build
node dist/index.js
```

Recommended: run with PM2 for process management and auto-restart:

```bash
npm install -g pm2
pm2 start dist/index.js --name whatsapp-gateway
pm2 save
pm2 startup
```

Or use Docker — see `Dockerfile` (future).

---

## Project Structure

```
WHATSAPP-GATEWAY/
├── src/
│   ├── index.ts           # entry point, Express setup
│   ├── whatsapp.ts        # WhatsAppManager: Baileys socket
│   ├── webhook.ts         # WebhookManager: registration + dispatch
│   ├── types.ts           # shared TypeScript interfaces
│   ├── qrcode-terminal.d.ts
│   └── routes/
│       ├── qr.ts          # GET /api/qr
│       ├── status.ts      # GET /api/status
│       ├── messages.ts    # POST /api/send
│       └── webhooks.ts    # CRUD /api/webhook
├── session/               # Baileys auth state (gitignored)
├── dist/                  # compiled output
├── package.json
├── tsconfig.json
└── README.md
```

---

## Limitations & Future Work

| Feature | Status |
|---------|--------|
| Single-tenant (one phone) | ✅ Ready |
| Multi-tenant (multiple phones) | Future |
| Media messages (image, audio, file) | Future |
| Message queue with retry | Future |
| Rate limiting per project | Future |
| Admin dashboard | Future |
| Docker image | Future |