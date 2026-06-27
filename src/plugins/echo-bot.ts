/**
 * Plugin de Exemplo: Echo Bot
 *
 * Quando recebe uma mensagem que começa com "!echo", responde com o mesmo texto.
 * Este plugin serve como exemplo e template para criar novos plugins.
 */

import { Plugin, PluginContext, PluginResult } from "../plugins.js";

export function createEchoBotPlugin(): Plugin {
  return {
    id: "echo-bot",
    name: "Echo Bot",
    description: "Repete mensagens que começam com !echo",
    events: ["message"],
    enabled: true,
    config: {
      triggerCommand: "!echo",
    },
    handler: async (ctx: PluginContext): Promise<PluginResult> => {
      const { data } = ctx;

      // Só processa se for mensagem de texto
      if (!data?.text || typeof data.text !== "string") {
        return { success: true, data: { skipped: true, reason: "not_text_message" } };
      }

      const text = data.text as string;

      // Verifica comando !echo
      if (!text.startsWith("!echo")) {
        return { success: true, data: { skipped: true, reason: "not_echo_command" } };
      }

      // Extrai texto após !echo
      const echoText = text.replace("!echo", "").trim() || "Echo!";

      logger.info("Echo Bot triggered", { from: ctx.phoneNumber, text: echoText });

      // Aqui você chiamaria sendWhatsApp() para responder
      // Por enquanto apenas retorna o que deveria ser enviado
      return {
        success: true,
        data: {
          action: "reply",
          to: ctx.phoneNumber,
          text: echoText,
        },
        stopPropagation: false, // Continua executando outros plugins
      };
    },
  };
}

// Import logger (vai funcionar quando plugin for carregado)
const logger = {
  info: (msg: string, data?: any) => console.log(`[EchoBot] ${msg}`, data),
  warn: (msg: string, data?: any) => console.warn(`[EchoBot] ${msg}`, data),
  error: (msg: string, data?: any) => console.error(`[EchoBot] ${msg}`, data),
  debug: (msg: string, data?: any) => console.debug(`[EchoBot] ${msg}`, data),
};