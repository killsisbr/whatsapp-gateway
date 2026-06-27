/**
 * Audit Log Middleware - Log automático de todas as requisições
 */

import type { Request, Response, NextFunction } from "express";
import { auditLogger } from "../audit.js";

/**
 * Middleware que loga todas as requisições
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const apiKeyId = req.headers["x-api-key"] as string | undefined;

  // Hook para logar apósresponse
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    auditLogger.apiRequest(
      req.method,
      req.originalUrl || req.url,
      res.statusCode,
      undefined, // tenantId - seria extraído da API key
      apiKeyId ? `[REDACTED]` : undefined,
      req.ip || req.socket.remoteAddress || undefined,
      req.headers["user-agent"] as string | undefined
    );
  });

  next();
}

/**
 * Middleware que loga apenas falhas de autenticação
 */
export function authFailureLogger(req: Request, res: Response, next: NextFunction): void {
  const apiKeyId = req.headers["x-api-key"] as string | undefined;

  res.on("finish", () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      auditLogger.authFailure(
        apiKeyId ? "[REDACTED]" : undefined,
        req.ip || req.socket.remoteAddress || undefined,
        `HTTP ${res.statusCode}`
      );
    }
  });

  next();
}

export default {
  auditLogMiddleware,
  authFailureLogger,
};