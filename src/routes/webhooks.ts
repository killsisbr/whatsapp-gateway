import { Router, type Request, type Response } from "express";
import type { WebhookManager } from "../webhook.js";

export function webhookRoutes(wh: WebhookManager): Router {
  const router = Router();

  // POST /api/webhook — register a webhook
  router.post("/", (req: Request, res: Response) => {
    const { project, url, events } = req.body;

    if (!project || !url || !events?.length) {
      return res.status(400).json({
        error: "Missing required fields: project, url, events[]",
      });
    }

    const valid: string[] = ["message", "status", "qr", "disconnect"];
    const invalid = events.filter((e: string) => !valid.includes(e));
    if (invalid.length) {
      return res.status(400).json({
        error: `Invalid events: ${invalid.join(", ")}. Valid: ${valid.join(", ")}`,
      });
    }

    const reg = wh.register(project, url, events);
    res.status(201).json(reg);
  });

  // DELETE /api/webhook/:id
  router.delete("/:id", (req: Request, res: Response) => {
    const id = req.params.id as string;
    const removed = wh.remove(id);
    if (!removed) return res.status(404).json({ error: "Webhook not found" });
    res.json({ success: true, removed: id });
  });

  // GET /api/webhook — list all registrations
  router.get("/", (_req: Request, res: Response) => {
    res.json(wh.list());
  });

  // GET /api/webhook/failed — view failed deliveries
  router.get("/failed", (_req: Request, res: Response) => {
    res.json(wh.getFailedDeliveries());
  });

  return router;
}
