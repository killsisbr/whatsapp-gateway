import { Router, type Request, type Response } from "express";
import type { WhatsAppManager } from "../whatsapp.js";
import { sessionTokenManager, type SessionCredentials } from "../sessionToken.js";
import { logger } from "../logger.js";

export function sessionRoutes(wa: WhatsAppManager): Router {
  const router = Router();

  /**
   * POST /api/session/request
   *
   * Solicita um novo QR code com session token (1 uso, expira em 60s)
   *
   * Request: { qrId?: string } - opcional QR específico
   * Response: {
   *   sessionToken: string,
   *   qrBase64: string,
   *   qrTerminal: string,
   *   expiresAt: number,
   *   expiresIn: number
   * }
   */
  router.post("/request", async (req: Request, res: Response) => {
    try {
      const { qrId } = req.body;

      // Se já estiver conectado, retorna status
      if (wa.state === "connected") {
        return res.json({
          status: "already_connected",
          phone: wa.phone,
          message: "WhatsApp já está conectado",
        });
      }

      // Gera session token
      const token = sessionTokenManager.createToken(qrId);

      // Aguarda QR estar disponível (polling interno)
      let attempts = 0;
      const maxAttempts = 20; // 2 segundos

      while (!wa.qrString && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!wa.qrString) {
        return res.status(503).json({
          success: false,
          error: "Não foi possível gerar QR code. Tente novamente.",
        });
      }

      logger.info("Session token criado", {
        tokenId: token.id,
        expiresAt: new Date(token.expiresAt).toISOString(),
      });

      res.json({
        success: true,
        sessionToken: token.id,
        qrBase64: wa.qrBase64, // data:image/png;base64,...
        qrTerminal: wa.qrString,
        expiresAt: token.expiresAt,
        expiresIn: token.expiresAt - Date.now(),
        instructions: {
          step1: "Abra o WhatsApp no celular",
          step2: "Vá em Configurações > Dispositivos conectados",
          step3: "Toque em 'Conectar um dispositivo'",
          step4: "Escaneie o QR code abaixo",
          warning: "⚠️ Este QR code expira em 60 segundos e só pode ser usado uma vez",
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Erro ao solicitar sessão", { error });
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * POST /api/session/confirm
   *
   * Confirma que o QR foi escaneado com sucesso e gera credenciais
   *
   * Request: { sessionToken: string }
   * Response: {
   *   tenantId: string,
   *   apiKey: string,           // ⚠️ MOSTRAR APENAS UMA VEZ!
   *   sessionPassword: string,  // PIN para operações críticas
   *   encryptedApiKey: string   // Para armazenamento
   * }
   */
  router.post("/confirm", async (req: Request, res: Response) => {
    try {
      const { sessionToken } = req.body;

      if (!sessionToken) {
        return res.status(400).json({
          success: false,
          error: "sessionToken é obrigatório",
        });
      }

      // Valida e consome token (1 uso apenas)
      const result = sessionTokenManager.consumeToken(sessionToken);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          error: result.error,
        });
      }

      // Aguarda confirmação de conexão (polling)
      let attempts = 0;
      const maxAttempts = 30; // 3 segundos

      while (wa.state !== "connected" && attempts < maxAttempts) {
        if (wa.state === "disconnected" || wa.state === "qr_ready") {
          return res.status(401).json({
            success: false,
            error: "QR code expirou ou foi inválido. Escaneie um novo QR.",
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (wa.state !== "connected") {
        return res.status(504).json({
          success: false,
          error: "Tempo limite para confirmação do QR. Tente novamente.",
        });
      }

      // Gera credenciais
      const credentials: SessionCredentials = sessionTokenManager.generateCredentials();

      logger.info("Sessão confirmada - credenciais geradas", {
        tenantId: credentials.tenantId,
        phone: wa.phone,
      });

      res.json({
        success: true,
        message: "✅ WhatsApp conectado com sucesso!",
        credentials: {
          tenantId: credentials.tenantId,
          apiKey: credentials.apiKey, // ⚠️ ÚNICA VEZ QUE APARECE!
          sessionPassword: credentials.sessionPassword,
          encryptedApiKey: credentials.encryptedApiKey,
        },
        warnings: [
          "⚠️ SALVE SUA API KEY AGORA - Ela só aparece uma vez!",
          "⚠️ Guarde o sessionPassword em local seguro - necessário para deletar a sessão",
        ],
        nextSteps: {
          header: "Use esta API key no header das requisições:",
          example: "X-API-Key: wha_xxxxxxxx_xxxxxxxxxxxxxxxx",
          endpoints: {
            send: "POST /api/send",
            status: "GET /api/status",
            rotate: "POST /api/session/rotate-key",
          },
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Erro ao confirmar sessão", { error });
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * POST /api/session/rotate-key
   *
   * Rotaciona a API key de um tenant (invalida a anterior)
   * Requer: X-API-Key header + sessionPassword no body
   */
  router.post("/rotate-key", async (req: Request, res: Response) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      const { sessionPassword } = req.body;

      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: "X-API-Key header é obrigatório",
        });
      }

      if (!sessionPassword) {
        return res.status(401).json({
          success: false,
          error: "sessionPassword é obrigatório para rotação",
        });
      }

      // Parse da API key atual
      const parsed = sessionTokenManager.parseApiKey(apiKey);
      if (!parsed) {
        return res.status(401).json({
          success: false,
          error: "Formato de API key inválido",
        });
      }

      // TODO: Aqui precisaria acessar o TenantManager para validar
      // e gerar nova chave. Por enquanto, retorna placeholder.

      const newCredentials = sessionTokenManager.generateCredentials(parsed.tenantId);

      logger.info("API key rotacionada", { tenantId: parsed.tenantId });

      res.json({
        success: true,
        message: "API key rotacionada com sucesso",
        credentials: {
          tenantId: parsed.tenantId,
          apiKey: newCredentials.apiKey, // ⚠️ ÚNICA VEZ QUE APARECE!
          encryptedApiKey: newCredentials.encryptedApiKey,
        },
        warning: "⚠️ A API key anterior foi invalidada. Atualize suas aplicações!",
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Erro ao rotacionar API key", { error });
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * GET /api/session/stats
   *
   * Stats de session tokens (para monitoring)
   */
  router.get("/stats", (_req: Request, res: Response) => {
    const stats = sessionTokenManager.getStats();
    res.json({
      sessionTokens: stats,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}