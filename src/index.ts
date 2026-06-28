import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { TenantManager } from "./tenant.js";
import { WhatsAppManager } from "./whatsapp.js";
import { AuthManager, authRoutes, authMiddleware } from "./auth.js";
import { tenantRoutes } from "./routes/tenants.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { pairingRoutes } from "./routes/pairing.js";
import { sessionRoutes } from "./routes/session.js";
import { deviceRoutes } from "./routes/devices.js";
import { ipWhitelistRoutes } from "./routes/ipWhitelist.js";
import { pluginRoutes } from "./routes/plugins.js";
import { Store } from "./store.js";
import { logger } from "./logger.js";
import { auditLogger } from "./audit.js";
import { tenantRateLimit, authRateLimit } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createIpWhitelistMiddleware } from "./middleware/ipWhitelist.js";
import { webhookQueue } from "./queue.js";
import { bullmqQueue } from "./queue-bullmq.js";
import { metrics } from "./metrics.js";
import { readFileSync } from "node:fs";
import "./types.js";

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(cors());
app.use(express.json());

// Rate limiting
app.use("/api/auth", authRateLimit);
app.use("/api", tenantRateLimit);

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
app.use(express.static(PUBLIC_DIR));

app.get("/scan", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/tenants", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "tenants.html")));
app.get("/stats", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "stats.html")));
app.get("/login", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "login.html")));
app.get("/tenants/:id/scan", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "tenant-scan.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "dashboard.html")));

// --- Persistência ---
const store = new Store();

// --- Auth ---
const am = new AuthManager(store);
app.use("/api/auth", authRoutes(am));

// --- Tenant system ---
const tm = new TenantManager(store);
const wh = tm.getWebhookManager();
const mw = authMiddleware(am);

// IP Whitelist middleware
const ipWhitelistMiddleware = createIpWhitelistMiddleware(tm);
app.use(ipWhitelistMiddleware);

// --- Plugin System ---
import { pluginManager } from "./plugins.js";
import { createEchoBotPlugin } from "./plugins/echo-bot.js";

// Registra plugin de exemplo (Echo Bot)
pluginManager.register(createEchoBotPlugin());
logger.info("Plugin system initialized with Echo Bot");

// API Key middleware — validates X-API-Key header if present
function apiKeyOrAuth(req: any, res: any, next: any) {
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey) {
    const result = tm.validateApiKey(apiKey);
    if (result) {
      req.userId = result.tenantId; // reuse same field for simplicity
      req.isApiKey = true;
      return next();
    }
    return res.status(401).json({ error: "Invalid API key" });
  }
  return mw(req, res, next);
}

// Tenant API (auth-protected)
app.post("/api/tenants/:id/start", apiKeyOrAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const isApiKey = (req as any).isApiKey;
  const tenant = isApiKey ? tm.get(req.params.id) : tm.getForUser(userId, req.params.id);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });
  let wa = tm.getWhatsAppManager(req.params.id);
  if (wa) return res.json({ state: wa.state, message: "already started" });
  wa = createTenantWa(req.params.id);
  await wa.start();
  res.json({ state: wa.state, message: "started" });
});

app.get("/api/tenants/:id/qr", apiKeyOrAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const isApiKey = (req as any).isApiKey;
  const tenant = isApiKey ? tm.get(req.params.id) : tm.getForUser(userId, req.params.id);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });
  
  let wa = tm.getWhatsAppManager(req.params.id);
  if (!wa) {
    wa = createTenantWa(req.params.id);
    await wa.start();
    // Wait a brief moment to allow the first QR code to be generated
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  const qr = (wa as any).qrString || (wa as any)._qrString;
  if (!qr) return res.status(404).json({ error: "no QR available yet" });
  res.json({ qr, base64: qr });
});

app.get("/api/tenants/:id/status", apiKeyOrAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const isApiKey = (req as any).isApiKey;
  const tenant = isApiKey ? tm.get(req.params.id) : tm.getForUser(userId, req.params.id);
  if (!tenant) return res.status(404).json({ error: "tenant not found" });
  
  let wa = tm.getWhatsAppManager(req.params.id);
  if (!wa) {
    // If not initialized, return disconnected status rather than 404
    return res.json({ connected: false, state: "disconnected", phone: null, lastSeen: null, qrPending: false });
  }
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

// --- Session Token Routes (QR com token único, expira em 60s) ---
// NOTA: legacyWa é o WhatsAppManager single-tenant. Para multi-tenant, usar /api/tenants/:id/...
const legacyWaForSession = new WhatsAppManager();
legacyWaForSession.on("message", (msg) => wh.dispatch("message", msg));
legacyWaForSession.on("connected", (phone) => {
  wh.dispatch("status", { connected: true, phone });
  logger.info("Legacy WhatsApp connected", { phone });
});
legacyWaForSession.on("disconnected", (reason) => wh.dispatch("disconnect", { reason }));
legacyWaForSession.on("qr", () => wh.dispatch("qr", { message: "New QR" }));
legacyWaForSession.start().catch((err) => logger.error("Failed to start legacy WhatsApp", { err }));

app.use("/api/session", sessionRoutes(legacyWaForSession));
app.use("/api/devices", deviceRoutes(tm));
app.use("/api/ip-whitelist", ipWhitelistRoutes(tm));
app.use("/api/plugins", pluginRoutes());

// --- Pairing Code (código de 8 dígitos, sem QR) ---
app.post("/api/pairing", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: "Missing field: phoneNumber" });
    }
    const wa = await getLegacyWa();
    const clean = phoneNumber.replace(/[^0-9]/g, "");
    const code = await wa.requestPairingCode(clean);
    res.json({
      success: true,
      pairingCode: code,
      instructions: `Digite o código ${code} no WhatsApp: Configurações > Dispositivos conectados > Conectar dispositivo`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Health (detalhado) ---
app.get("/health", (_req, res) => {
  const mem = process.memoryUsage();
  const queueStatus = webhookQueue.getQueueStatus();
  res.json({
    ok: true,
    version: "1.0.0",
    state: tm.count() > 0 ? "operational" : "idle",
    tenants: {
      total: tm.count(),
    },
    uptime: process.uptime(),
    queue: {
      pending: queueStatus.total,
      byAttempts: queueStatus.byAttempts,
    },
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB",
      rss: Math.round(mem.rss / 1024 / 1024) + "MB",
    },
    timestamp: new Date().toISOString(),
  });
});

// --- Prometheus Metrics ---
app.get("/metrics", async (req, res) => {
  // Atualiza métricas da queue
  const queueStatus = await webhookQueue.getQueueStatus();
  metrics.incCounter('queue_size', {}, queueStatus.total);

  res.set('Content-Type', 'text/plain');
  res.send(metrics.generateMetrics());
});

// --- API Docs (OpenAPI) ---
app.get("/api/openapi.yaml", (_req, res) => {
  try {
    const yaml = readFileSync(new URL("./openapi.yaml", import.meta.url), "utf-8");
    res.setHeader("Content-Type", "text/yaml");
    res.send(yaml);
  } catch {
    res.status(404).json({ error: "OpenAPI spec not found" });
  }
});

app.get("/docs", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>WhatsApp Gateway — API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/api/openapi.yaml", dom_id: "#swagger-ui" })</script>
</body>
</html>`);
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

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

async function main() {
  const server = app.listen(PORT, () => {
    logger.info(`WhatsApp Gateway running on http://localhost:${PORT}`);
    logger.info(`  POST /api/auth/register — Criar conta`);
    logger.info(`  POST /api/auth/login — Login`);
    logger.info(`  POST /api/tenants/register — Criar tenant (auth)`);
    logger.info(`  GET /tenants — Painel web`);
    logger.info(`  GET  /metrics — Prometheus metrics`);
    logger.info(`Docs: http://localhost:${PORT}/docs`);
  });

  // Inicializa BullMQ (se Redis disponível)
  await bullmqQueue.init();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} recebido — iniciando graceful shutdown`);

    // 1. Parar servidor de aceitar novas conexões
    server.close(async () => {
      logger.info('Servidor HTTP fechado');

      // 2. Salvar estado da fila
      await bullmqQueue.close();
      logger.info('Fila BullMQ fechada');

      // 3. Flush de audit logs
      (auditLogger as any).flush();
      logger.info('Audit logs persistidos');

      logger.info('Graceful shutdown completo');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => { logger.error(`Fatal: ${err}`); process.exit(1); });