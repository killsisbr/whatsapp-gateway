import { Router, type Request, type Response } from "express";
import type { WhatsAppManager } from "../whatsapp.js";

export function qrRoutes(wa: WhatsAppManager): Router {
  const router = Router();

  // GET /api/qr — returns current QR code (if pending)
  router.get("/", (_req: Request, res: Response) => {
    if (wa.state === "connected") {
      return res.json({
        status: "already_connected",
        phone: wa.phone,
      });
    }

    if (!wa.qrString) {
      return res.status(404).json({
        status: "no_qr",
        message: "QR still loading or socket disconnected. Try again in a few seconds.",
      });
    }

    res.json({
      status: "qr_ready",
      qr: wa.qrBase64,       // data:image/png;base64,...
      qrTerminal: wa.qrString,
      expires: Date.now() + 60_000,
    });
  });

  // GET /api/qr/terminal — QR as raw string (for terminal/node-qrcode-terminal)
  router.get("/terminal", (_req: Request, res: Response) => {
    if (!wa.qrString) {
      return res.status(404).json({ status: "no_qr" });
    }
    res.type("text/plain").send(wa.qrString);
  });

  return router;
}
