import { Router, type Request, type Response } from "express";
import type { WhatsAppManager } from "../whatsapp.js";

export function messageRoutes(wa: WhatsAppManager): Router {
  const router = Router();

  // POST /api/send — send a text message
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { to, text, project, quotedMessageId } = req.body;

      if (!to || !text) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: to, text",
        });
      }

      if (wa.state !== "connected") {
        return res.status(503).json({
          success: false,
          error: "WhatsApp not connected. Scan QR first.",
          state: wa.state,
        });
      }

      const result = await wa.sendMessage(to, text);

      res.json({
        success: true,
        messageId: result?.key?.id,
        project: project || "default",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
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
