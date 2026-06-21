import { Router } from "express";
import { TenantManager } from "../tenant.js";
import { AuthManager, authMiddleware } from "../auth.js";

export function tenantRoutes(tm: TenantManager, am: AuthManager) {
  const router = Router();
  const mw = authMiddleware(am);

  // All routes require auth
  router.use(mw);

  // POST /api/tenants/register
  router.post("/register", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const tenant = tm.register((req as any).userId, name);
    res.status(201).json(tenant);
  });

  // GET /api/tenants
  router.get("/", (req, res) => {
    res.json(tm.listForUser((req as any).userId!));
  });

  // GET /api/tenants/:id
  router.get("/:id", (req, res) => {
    const tenant = tm.getForUser((req as any).userId, req.params.id as string);
    if (!tenant) return res.status(404).json({ error: "tenant not found" });
    res.json(tenant);
  });

  // DELETE /api/tenants/:id
  router.delete("/:id", (req, res) => {
    const removed = tm.remove((req as any).userId, req.params.id as string);
    if (!removed) return res.status(404).json({ error: "tenant not found" });
    res.json({ success: true });
  });

  // PUT /api/tenants/:id/webhook
  router.put("/:id/webhook", (req, res) => {
    const { url, events } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });
    const updated = tm.updateWebhook((req as any).userId, req.params.id as string, url, events || ["message"]);
    if (!updated) return res.status(404).json({ error: "tenant not found" });
    res.json({ success: true, webhookUrl: url, webhookEvents: events || ["message"] });
  });

  // GET /api/tenants/:id/webhook
  router.get("/:id/webhook", (req, res) => {
    const tenant = tm.getForUser((req as any).userId, req.params.id as string);
    if (!tenant) return res.status(404).json({ error: "tenant not found" });
    res.json({ webhookUrl: tenant.webhookUrl || null, webhookEvents: tenant.webhookEvents });
  });

  // --- API Keys ---
  router.post("/:id/keys", (req, res) => {
    const tenant = tm.getForUser((req as any).userId, req.params.id as string);
    if (!tenant) return res.status(404).json({ error: "tenant not found" });
    const { name } = req.body;
    const key = tm.createApiKey(req.params.id as string, name || "Default");
    // Return full key only on creation
    res.status(201).json(key);
  });

  router.get("/:id/keys", (req, res) => {
    const tenant = tm.getForUser((req as any).userId, req.params.id as string);
    if (!tenant) return res.status(404).json({ error: "tenant not found" });
    res.json(tm.listApiKeys(req.params.id as string));
  });

  router.delete("/:id/keys/:keyId", (req, res) => {
    const tenant = tm.getForUser((req as any).userId, req.params.id as string);
    if (!tenant) return res.status(404).json({ error: "tenant not found" });
    const deleted = tm.deleteApiKey(req.params.id as string, req.params.keyId as string);
    if (!deleted) return res.status(404).json({ error: "key not found" });
    res.json({ success: true });
  });

  return router;
}