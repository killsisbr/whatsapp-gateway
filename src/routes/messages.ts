import { Router, type Request, type Response } from "express";
import type { WhatsAppManager } from "../whatsapp.js";
import { auditLogger } from "../audit.js";
import { sendMediaFromUrl, validateMediaType, type MediaType } from "../media.js";

export function messageRoutes(wa: WhatsAppManager): Router {
  const router = Router();

  // POST /api/send — send a text message
  router.post("/", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { to, text, project, quotedMessageId } = req.body;
    const apiKeyId = req.headers["x-api-key"] as string | undefined;

    try {
      if (!to || !text) {
        auditLogger.apiRequest("POST", "/api/send", 400, undefined, apiKeyId, req.ip);
        return res.status(400).json({
          success: false,
          error: "Missing required fields: to, text",
        });
      }

      if (wa.state !== "connected") {
        auditLogger.apiRequest("POST", "/api/send", 503, undefined, apiKeyId, req.ip);
        return res.status(503).json({
          success: false,
          error: "WhatsApp not connected. Scan QR first.",
          state: wa.state,
        });
      }

      const result = await wa.sendMessage(to, text);

      auditLogger.messageSent("default", to, result?.key?.id || undefined);
      auditLogger.apiRequest("POST", "/api/send", 200, "default", apiKeyId, req.ip);

      res.json({
        success: true,
        messageId: result?.key?.id,
        project: project || "default",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      auditLogger.messageSent("default", to, undefined, error);
      auditLogger.apiRequest("POST", "/api/send", 500, "default", apiKeyId, req.ip);
      res.status(500).json({ success: false, error });
    }
  });

  // POST /api/send/media — send media message (image, video, audio, document, sticker)
  router.post("/media", async (req: Request, res: Response) => {
    const { to, type, url, caption, filename, mimetype } = req.body;
    const apiKeyId = req.headers["x-api-key"] as string | undefined;

    try {
      // Validações
      if (!to || !type || !url) {
        auditLogger.apiRequest("POST", "/api/send/media", 400, undefined, apiKeyId, req.ip);
        return res.status(400).json({
          success: false,
          error: "Missing required fields: to, type, url",
        });
      }

      if (!validateMediaType(type, mimetype)) {
        auditLogger.apiRequest("POST", "/api/send/media", 400, undefined, apiKeyId, req.ip);
        return res.status(400).json({
          success: false,
          error: `Invalid media type: ${type}. Valid types: image, video, audio, document, sticker`,
        });
      }

      if (wa.state !== "connected") {
        auditLogger.apiRequest("POST", "/api/send/media", 503, undefined, apiKeyId, req.ip);
        return res.status(503).json({
          success: false,
          error: "WhatsApp not connected",
          state: wa.state,
        });
      }

      // Envia mídia
      const result = await sendMediaFromUrl(wa, {
        to,
        type: type as MediaType,
        url,
        caption,
        filename,
        mimetype,
      });

      auditLogger.messageSent("default", to, result.messageId);
      auditLogger.apiRequest("POST", "/api/send/media", 200, "default", apiKeyId, req.ip);

      res.json({
        success: true,
        messageId: result.messageId,
        type,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      auditLogger.messageSent("default", to, undefined, error);
      auditLogger.apiRequest("POST", "/api/send/media", 500, undefined, apiKeyId, req.ip);
      res.status(500).json({ success: false, error });
    }
  });

  // POST /api/messages — incoming messages (for polling, optional)
  // For now returns placeholder — real implementation would need a buffer/store
  router.get("/incoming", (_req: Request, res: Response) => {
    res.json({
      message: "Incoming messages are dispatched via webhooks. Register a webhook at POST /api/webhook",
    });
  });

  return router;
}
