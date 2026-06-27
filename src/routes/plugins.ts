import { Router, type Request, type Response } from "express";
import { pluginManager, type Plugin } from "../plugins.js";
import { auditLogger } from "../audit.js";

export function pluginRoutes(): Router {
  const router = Router();

  // GET /api/plugins - Lista todos plugins
  router.get("/", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;

    const plugins = pluginManager.list().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      events: p.events,
      enabled: p.enabled,
    }));

    const status = pluginManager.getStatus();

    auditLogger.apiRequest("GET", "/api/plugins", 200, undefined, apiKeyId, req.ip);

    res.json({
      success: true,
      plugins,
      summary: status,
    });
  });

  // GET /api/plugins/:id - Detalhes de um plugin
  router.get("/:id", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const { id } = req.params;

    const plugins = pluginManager.list();
    const plugin = plugins.find(p => p.id === id);

    if (!plugin) {
      auditLogger.apiRequest("GET", "/api/plugins/:id", 404, undefined, apiKeyId, req.ip);
      return res.status(404).json({
        success: false,
        error: "Plugin not found",
      });
    }

    auditLogger.apiRequest("GET", "/api/plugins/:id", 200, undefined, apiKeyId, req.ip);

    res.json({
      success: true,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        events: plugin.events,
        enabled: plugin.enabled,
        config: plugin.config,
      },
    });
  });

  // POST /api/plugins/:id/enable - Habilita plugin
  router.post("/:id/enable", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const { id } = req.params;
    const pluginId = Array.isArray(id) ? id[0] : id;

    const success = pluginManager.setEnabled(pluginId, true);

    if (!success) {
      auditLogger.apiRequest("POST", "/api/plugins/:id/enable", 404, undefined, apiKeyId, req.ip);
      return res.status(404).json({
        success: false,
        error: "Plugin not found",
      });
    }

    auditLogger.apiRequest("POST", "/api/plugins/:id/enable", 200, undefined, apiKeyId, req.ip);

    res.json({
      success: true,
      pluginId: id,
      enabled: true,
    });
  });

  // POST /api/plugins/:id/disable - Desabilita plugin
  router.post("/:id/disable", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const { id } = req.params;
    const pluginId = Array.isArray(id) ? id[0] : id;

    const success = pluginManager.setEnabled(pluginId, false);

    if (!success) {
      auditLogger.apiRequest("POST", "/api/plugins/:id/disable", 404, undefined, apiKeyId, req.ip);
      return res.status(404).json({
        success: false,
        error: "Plugin not found",
      });
    }

    auditLogger.apiRequest("POST", "/api/plugins/:id/disable", 200, undefined, apiKeyId, req.ip);

    res.json({
      success: true,
      pluginId: id,
      enabled: false,
    });
  });

  // DELETE /api/plugins/:id - Remove plugin
  router.delete("/:id", async (req: Request, res: Response) => {
    const apiKeyId = req.headers["x-api-key"] as string | undefined;
    const { id } = req.params;
    const pluginId = Array.isArray(id) ? id[0] : id;

    const removed = pluginManager.unregister(pluginId);

    if (!removed) {
      auditLogger.apiRequest("DELETE", "/api/plugins/:id", 404, undefined, apiKeyId, req.ip);
      return res.status(404).json({
        success: false,
        error: "Plugin not found",
      });
    }

    auditLogger.apiRequest("DELETE", "/api/plugins/:id", 200, undefined, apiKeyId, req.ip);

    res.json({
      success: true,
      pluginId: id,
      message: "Plugin removed",
    });
  });

  return router;
}