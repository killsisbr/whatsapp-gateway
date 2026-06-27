import { Router, type Request, type Response } from "express";
import type { TenantManager } from "../tenant.js";
import { auditLogger } from "../audit.js";

export function deviceRoutes(tm: TenantManager): Router {
  const router = Router();

  // GET /api/devices - Lista todos dispositivos
  router.get("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("GET", "/api/devices", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const devices = tm.listDevices(auth.tenantId);
    auditLogger.apiRequest("GET", "/api/devices", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      devices,
      total: devices.length,
    });
  });

  // POST /api/devices - Adiciona novo dispositivo
  router.post("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("POST", "/api/devices", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      auditLogger.apiRequest("POST", "/api/devices", 400, auth.tenantId, apiKeyId, req.ip);
      return res.status(400).json({
        success: false,
        error: "Missing required field: phoneNumber",
      });
    }

    const device = tm.addDevice(auth.tenantId, phoneNumber);

    if (!device) {
      auditLogger.apiRequest("POST", "/api/devices", 500, auth.tenantId, apiKeyId, req.ip);
      return res.status(500).json({ success: false, error: "Failed to add device" });
    }

    auditLogger.apiRequest("POST", "/api/devices", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      device,
      message: "Device added. Scan QR code to connect.",
    });
  });

  // DELETE /api/devices/:phoneNumber - Remove dispositivo
  router.delete("/:phoneNumber", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const auth = tm.validateApiKey(apiKeyId || "");

    if (!auth) {
      auditLogger.apiRequest("DELETE", "/api/devices/:phoneNumber", 401, undefined, apiKeyId, req.ip);
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const { phoneNumber } = req.params;
    const phoneNumberStr = Array.isArray(phoneNumber) ? phoneNumber[0] : phoneNumber;
    const removed = tm.removeDevice(auth.tenantId, phoneNumberStr);

    if (!removed) {
      auditLogger.apiRequest("DELETE", "/api/devices/:phoneNumber", 404, auth.tenantId, apiKeyId, req.ip);
      return res.status(404).json({
        success: false,
        error: "Device not found",
      });
    }

    auditLogger.apiRequest("DELETE", "/api/devices/:phoneNumber", 200, auth.tenantId, apiKeyId, req.ip);

    res.json({
      success: true,
      message: "Device removed successfully",
    });
  });

  return router;
}