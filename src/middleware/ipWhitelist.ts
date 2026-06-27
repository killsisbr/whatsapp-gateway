import { Request, Response, NextFunction } from "express";
import { TenantManager } from "../tenant.js";
import { auditLogger } from "../audit.js";

/**
 * Middleware para verificar IP whitelist
 * Se o tenant tiver IP whitelist definida, verifica se o IP da requisição está permitido
 */
export function createIpWhitelistMiddleware(tm: TenantManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-api-key"] as string | undefined;
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";

    if (!apiKey) {
      return next(); // Sem API key, deixa o tenantAuth lidar
    }

    const auth = tm.validateApiKey(apiKey);
    if (!auth) {
      return next(); // API key inválida, deixa o tenantAuth lidar
    }

    const tenantId = auth.tenantId;

    // Verifica se IP está na whitelist
    if (!tm.isIpAllowed(tenantId, clientIp)) {
      auditLogger.apiRequest(req.method, req.path, 403, tenantId, apiKey, clientIp);

      return res.status(403).json({
        success: false,
        error: "IP address not allowed",
        message: `Your IP (${clientIp}) is not in the allowed list`,
      });
    }

    next();
  };
}