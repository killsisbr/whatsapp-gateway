import { Router, type Request, type Response } from "express";
import type { TenantManager } from "../tenant.js";
import { auditLogger } from "../audit.js";

export function ipWhitelistRoutes(tm: TenantManager): Router {
  const router = Router();

  // GET /api/ip-whitelist - Retorna whitelist atual
  router.get("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("GET", "/api/ip-whitelist", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    // Recupera tenant para ver whitelist
    const tenant = Array.from(tm["tenants"].values()).find(t => t.id === auth.tenantId);
    const whitelist = tenant?.ipWhitelist || [];

    auditLogger.apiRequest("GET", "/api/ip-whitelist", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      tenantId: auth.tenantId,
      ipWhitelist: whitelist,
      enabled: whitelist.length > 0,
    });
  });

  // PUT /api/ip-whitelist - Define whitelist completa
  router.put("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("PUT", "/api/ip-whitelist", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { ips } = req.body;

    if (!Array.isArray(ips)) {
      auditLogger.apiRequest("PUT", "/api/ip-whitelist", 400, auth.tenantId, apiKeyId, req.ip);
      return res.status(400).json({
        success: false,
        error: "Missing or invalid field: ips (must be array)",
      });
    }

    tm.setIpWhitelist(auth.tenantId, ips);

    auditLogger.apiRequest("PUT", "/api/ip-whitelist", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      tenantId: auth.tenantId,
      ipWhitelist: ips,
      message: `IP whitelist updated with ${ips.length} address(es)`,
    });
  });

  // POST /api/ip-whitelist - Adiciona IP à whitelist
  router.post("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("POST", "/api/ip-whitelist", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { ip } = req.body;

    if (!ip) {
      auditLogger.apiRequest("POST", "/api/ip-whitelist", 400, auth.tenantId, apiKeyId, req.ip);
      return res.status(400).json({
        success: false,
        error: "Missing required field: ip",
      });
    }

    tm.addIpToWhitelist(auth.tenantId, ip);

    auditLogger.apiRequest("POST", "/api/ip-whitelist", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      tenantId: auth.tenantId,
      ipAdded: ip,
      message: "IP added to whitelist",
    });
  });

  // DELETE /api/ip-whitelist/:ip - Remove IP da whitelist
  router.delete("/:ip", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("DELETE", "/api/ip-whitelist/:ip", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { ip } = req.params;
    const ipStr = Array.isArray(ip) ? ip[0] : ip;
    const removed = tm.removeIpFromWhitelist(auth.tenantId, ipStr);

    if (!removed) {
      auditLogger.apiRequest("DELETE", "/api/ip-whitelist/:ip", 404, auth.tenantId, apiKeyId, req.ip);
      return res.status(404).json({
        success: false,
        error: "IP not found in whitelist",
      });
    }

    auditLogger.apiRequest("DELETE", "/api/ip-whitelist/:ip", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      tenantId: auth.tenantId,
      ipRemoved: ip,
      message: "IP removed from whitelist",
    });
  });

  // DELETE /api/ip-whitelist - Limpa whitelist completa
  router.delete("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("DELETE", "/api/ip-whitelist", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    tm.clearIpWhitelist(auth.tenantId);

    auditLogger.apiRequest("DELETE", "/api/ip-whitelist", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      tenantId: auth.tenantId,
      message: "IP whitelist cleared",
    });
  });

  return router;
}