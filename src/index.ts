import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { TenantManager } from "./tenant.js";
import { WhatsAppManager } from "./whatsapp.js";
import { AuthManager, authRoutes, authMiddleware } from "./auth.js";
import { tenantRoutes } from "./routes/tenants.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { Store } from "./store.js";
import "./types.js";

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
app.use(express.static(PUBLIC_DIR));

app.get("/scan", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/tenants", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "tenants.html")));
app.get("/stats", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "stats.html")));
app.get("/tenants/:id/scan", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "tenant-scan.html")));

// --- Persistência ---
const store = new Store();

// --- Auth ---
const am = new AuthManager(store);
app.use("/api/auth", authRoutes(am));

// --- Tenant system ---
const tm = new TenantManager(store);
const wh = tm.getWebhookManager();
const mw = authMiddleware(am);

// API Key middleware — validates X-API-Key header if present
function apiKeyOrAuth(req: any, res: any, next: any) {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey) {
    const result = tm.validateApiKey(apiKey);
    if (result) {
      req.userId = result.tenantId; // reuse same field for simplicity
      return next();
    }
    return res.status(401).json({ error: "Invalid API key" });
  }
  return mw(req, res, next);
}

// Tenant API (auth-protected)
app.post("/api/tenants/:id/start", mw, async (req, res) => {
  const userId = (req as any).userId as string;
  const tenant = tm.getForUser(userId, req.params.id);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });
  let wa = tm.getWhatsAppManager(req.params.id);
  if (wa) return res.json({ state: wa.state, message: "already started" });
  wa = createTenantWa(req.params.id);
  await wa.start();
  res.json({ state: wa.state, message: "started" });
});

app.get("/api/tenants/:id/qr", mw, (req, res) => {
  if (!tm.getForUser((req as any).userId as string, req.params.id)) return res.status(404).json({ error: "tenant not found" });
  const wa = tm.getWhatsAppManager(req.params.id);
  if (!wa) return res.status(404).json({ error: "tenant not initialized" });
  const qr = (wa as any).qrString || (wa as any)._qrString;
  if (!qr) return res.status(404).json({ error: "no QR available yet" });
  res.json({ qr, base64: qr });
});

app.get("/api/tenants/:id/status", mw, (req, res) => {
  const tenant = tm.getForUser((req as any).userId as string, req.params.id);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });
  const wa = tm.getWhatsAppManager(req.params.id);
  if (!wa) return res.status(404).json({ error: "tenant not initialized" });
  res.json({ connected: wa.connected, state: wa.state, phone: wa.phone, lastSeen: wa.lastSeen, qrPending: wa.qrPending });
});

app.post("/api/tenants/:id/send", apiKeyOrAuth, async (req, res) => {
  const tenantId = req.params.id;
  const tenant = tm.get(tenantId);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });
  const wa = tm.getWhatsAppManager(tenantId);
  if (!wa) return res.status(404).json({ error: "tenant not initialized" });
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: "to and text required" });
  try {
    const result = await wa.sendMessage(to, text);
    tm.incMessageSent(tenantId);
    res.json({ success: true, messageId: result });
  } catch (err: any) {
    tm.incMessageFailed(tenantId);
    res.status(503).json({ error: err.message });
  }
});

app.use("/api/tenants", tenantRoutes(tm, am));

// --- Legacy single-tenant ---
let legacyWa: WhatsAppManager | null = null;
async function getLegacyWa() {
  if (!legacyWa) {
    legacyWa = new WhatsAppManager();
    legacyWa.on("message", (msg) => wh.dispatch("message", msg));
    legacyWa.on("connected", (phone) => wh.dispatch("status", { connected: true, phone }));
    legacyWa.on("disconnected", (reason) => wh.dispatch("disconnect", { reason }));
    legacyWa.on("qr", () => wh.dispatch("qr", { message: "New QR" }));
    await legacyWa.start();
  }
  return legacyWa;
}

app.post("/api/send", async (req, res) => {
  try {
    const wa = await getLegacyWa();
    const result = await wa.sendMessage(req.body.to, req.body.text);
    res.json({ success: true, messageId: result });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

app.get("/api/qr", async (req, res) => {
  const wa = await getLegacyWa();
  res.json({ qr: (wa as any).qrString || "", base64: (wa as any).qrString || "" });
});

app.get("/api/status", async (req, res) => {
  const wa = await getLegacyWa();
  res.json({ connected: wa.connected, state: wa.state, phone: wa.phone, lastSeen: wa.lastSeen, qrPending: wa.qrPending });
});

app.use("/api/webhook", webhookRoutes(wh));

// --- Health ---
app.get("/health", (_req, res) => {
  res.json({ ok: true, tenants: tm.count(), uptime: process.uptime() });
});

// --- Stats ---
app.get("/api/tenants/:id/stats", authMiddleware(am), (req, res) => {
  const tenantId = req.params.id;
  const tenant = tm.getForUser((req as any).userId as string, tenantId);
  if (!tenant) return res.status(404).json({ error: "not found" });
  res.json({
    messagesSent: tenant.messagesSent,
    messagesReceived: tenant.messagesReceived,
    messagesFailed: tenant.messagesFailed,
    qrScans: tenant.qrScans,
    lastConnectedAt: tenant.lastConnectedAt,
    lastDisconnectedAt: tenant.lastDisconnectedAt,
    state: tenant.state,
    phone: tenant.phone,
  });
});

function createTenantWa(tenantId: string) {
  const wa = new WhatsAppManager(`session/${tenantId}`);
  wa.on("qr", () => { tm.incQrScan(tenantId); tm.dispatchToTenant(tenantId, "qr", { message: "New QR" }); });
  wa.on("connected", (phone) => {
    const t = tm.get(tenantId);
    if (t) { t.connected = true; t.state = "connected"; t.phone = phone; t.lastSeen = new Date(); }
    tm.markConnected(tenantId);
    tm.dispatchToTenant(tenantId, "status", { connected: true, phone });
  });
  wa.on("disconnected", (reason) => {
    const t = tm.get(tenantId);
    if (t) { t.connected = false; t.state = "disconnected"; }
    tm.markDisconnected(tenantId);
    tm.dispatchToTenant(tenantId, "disconnect", { reason });
  });
  wa.on("message", (msg) => { tm.incMessageReceived(tenantId); tm.dispatchToTenant(tenantId, "message", msg); });
  tm.setWhatsAppManager(tenantId, wa);
  return wa;
}

async function main() {
  app.listen(PORT, () => {
    console.log(`\n🔌 WhatsApp Gateway running on http://localhost:${PORT}`);
    console.log(`   ${"POST /api/auth/register".padEnd(35)} Criar conta`);
    console.log(`   ${"POST /api/auth/login".padEnd(35)} Login`);
    console.log(`   ${"POST /api/tenants/register".padEnd(35)} Criar tenant (auth)`);
    console.log(`   ${"GET /tenants".padEnd(35)} Painel web`);
  });
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });