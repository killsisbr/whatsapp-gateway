import { Router, type Request, type Response } from "express";
import type { WhatsAppManager } from "../whatsapp.js";

export function statusRoutes(wa: WhatsAppManager): Router {
  const router = Router();

  // GET /api/status — connection status
  router.get("/", (_req: Request, res: Response) => {
    res.json({
      connected: wa.state === "connected",
      state: wa.state,
      phone: wa.phone,
      lastSeen: wa.state === "connected" ? new Date().toISOString() : null,
      qrPending: wa.state === "qr_ready",
    });
  });

  return router;
}
