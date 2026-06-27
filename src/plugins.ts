/**
 * Sistema de Plugins para WhatsApp Gateway
 *
 * Plugins são handlers customizáveis que interceptam eventos específicos.
 * Cada plugin pode processar eventos antes ou depois do webhook principal.
 */

import { logger } from "./logger.js";

export type PluginEvent = "message" | "message_ack" | "presence" | "qr" | "connected" | "disconnected";

export interface PluginContext {
  eventId: string;
  timestamp: Date;
  tenantId: string;
  phoneNumber?: string;
  data: any;
}

export interface Plugin {
  id: string;
  name: string;
  description?: string;
  events: PluginEvent[];
  enabled: boolean;
  config?: Record<string, any>;
  handler: (ctx: PluginContext) => Promise<PluginResult>;
}

export interface PluginResult {
  success: boolean;
  data?: any;
  error?: string;
  stopPropagation?: boolean; // Se true, para execução de plugins subsequentes
}

interface PluginResultInternal extends PluginResult {
  _pluginId?: string;
  _duration?: number;
}

export interface PluginRegistry {
  [key: string]: Plugin;
}

/**
 * Gerenciador de Plugins
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private eventHandlers: Map<PluginEvent, Plugin[]> = new Map();

  /**
   * Registra um plugin
   */
  register(plugin: Plugin): boolean {
    if (this.plugins.has(plugin.id)) {
      logger.warn("Plugin already registered", { id: plugin.id });
      return false;
    }

    this.plugins.set(plugin.id, plugin);

    // Indexa por evento
    for (const event of plugin.events) {
      const handlers = this.eventHandlers.get(event) || [];
      handlers.push(plugin);
      this.eventHandlers.set(event, handlers);
    }

    logger.info("Plugin registered", { id: plugin.id, name: plugin.name, events: plugin.events });
    return true;
  }

  /**
   * Remove um plugin
   */
  unregister(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    // Remove do índice de eventos
    for (const event of plugin.events) {
      const handlers = this.eventHandlers.get(event) || [];
      const index = handlers.findIndex(p => p.id === pluginId);
      if (index !== -1) handlers.splice(index, 1);
      this.eventHandlers.set(event, handlers);
    }

    this.plugins.delete(pluginId);
    logger.info("Plugin unregistered", { id: pluginId });
    return true;
  }

  /**
   * Habilita/desabilita plugin
   */
  setEnabled(pluginId: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    plugin.enabled = enabled;
    logger.info("Plugin enabled/disabled", { id: pluginId, enabled });
    return true;
  }

  /**
   * Lista todos plugins
   */
  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Lista plugins por evento
   */
  listByEvent(event: PluginEvent): Plugin[] {
    return (this.eventHandlers.get(event) || []).filter(p => p.enabled);
  }

  /**
   * Executa plugins para um evento específico
   * Plugins são executados em ordem de registro
   */
  async execute(event: PluginEvent, context: PluginContext): Promise<PluginResult[]> {
    const handlers = this.listByEvent(event);
    const results: PluginResult[] = [];

    if (handlers.length === 0) {
      return results;
    }

    logger.debug("Executing plugins", { event, pluginCount: handlers.length });

    for (const plugin of handlers) {
      try {
        const result = await plugin.handler(context);
        const internalResult = result as PluginResultInternal;
        internalResult._pluginId = plugin.id;
        internalResult._duration = internalResult._duration || 0;
        results.push(result);

        logger.debug("Plugin executed", {
          id: plugin.id,
          success: result.success,
          stopPropagation: result.stopPropagation,
        });

        // Se um plugin pediu para parar propagação, encerra
        if (result.stopPropagation) {
          logger.info("Plugin stopped propagation", { id: plugin.id });
          break;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error("Plugin execution failed", { id: plugin.id, error });
        const errorResult: PluginResultInternal = {
          success: false,
          error,
          _pluginId: plugin.id,
        };
        results.push(errorResult);
      }
    }

    return results;
  }

  /**
   * Executa plugin específico
   */
  async executePlugin(pluginId: string, context: PluginContext): Promise<PluginResultInternal | null> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      logger.warn("Plugin not found", { id: pluginId });
      return null;
    }

    if (!plugin.enabled) {
      logger.warn("Plugin is disabled", { id: pluginId });
      return null;
    }

    try {
      const result = await plugin.handler(context);
      const internalResult: PluginResultInternal = result;
      internalResult._pluginId = pluginId;
      return internalResult;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Plugin execution failed", { id: pluginId, error });
      return { success: false, error, _pluginId: pluginId };
    }
  }

  /**
   * Obtém status do plugin manager
   */
  getStatus() {
    const total = this.plugins.size;
    const enabled = Array.from(this.plugins.values()).filter(p => p.enabled).length;
    const events = Array.from(this.eventHandlers.entries()).map(([event, handlers]) => ({
      event,
      count: handlers.filter(h => h.enabled).length,
    }));

    return {
      total,
      enabled,
      disabled: total - enabled,
      events,
    };
  }
}

// Exporta instância singleton
export const pluginManager = new PluginManager();