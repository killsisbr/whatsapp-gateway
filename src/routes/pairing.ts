import { Router, type Request, type Response } from "express";
import type { WhatsAppManager } from "../whatsapp.js";

export function pairingRoutes(wa: WhatsAppManager): Router {
  const router = Router();

  // POST /api/pairing — request a pairing code for a phone number
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          success: false,
          error: "Missing required field: phoneNumber",
        });
      }

      if (wa.state === "connected") {
        return res.json({
          success: true,
          status: "already_connected",
          phone: wa.phone,
        });
      }

      // Clean phone: remove +, spaces, dashes
      const clean = phoneNumber.replace(/[^0-9]/g, "");

      const code = await wa.requestPairingCode(clean);

      res.json({
        success: true,
        pairingCode: code,
        instructions: `Digite o código ${code} no WhatsApp: Configurações > Dispositivos conectados > Conectar dispositivo`,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error });
    }
  });

  return router;
}
