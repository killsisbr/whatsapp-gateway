/**
 * Testes Unitários para WhatsApp Gateway
 * Cobertura alvo: 80%
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager, type Plugin, type PluginContext } from './plugins.js';

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  it('deve registrar um plugin', () => {
    const plugin: Plugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    const result = manager.register(plugin);

    expect(result).toBe(true);
    expect(manager.list()).toHaveLength(1);
  });

  it('não deve registrar plugin duplicado', () => {
    const plugin: Plugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    manager.register(plugin);
    const result = manager.register(plugin);

    expect(result).toBe(false);
  });

  it('deve remover um plugin', () => {
    const plugin: Plugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    manager.register(plugin);
    const result = manager.unregister('test-plugin');

    expect(result).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });

  it('deve habilitar/desabilitar plugin', () => {
    const plugin: Plugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    manager.register(plugin);

    expect(manager.listByEvent('message')).toHaveLength(1);

    manager.setEnabled('test-plugin', false);

    expect(manager.listByEvent('message')).toHaveLength(0);
  });

  it('deve executar plugins para um evento', async () => {
    const handlerMock = vi.fn().mockResolvedValue({ success: true });
    const plugin: Plugin = {
      id: 'test-plugin',
      name: 'Test Plugin',
      events: ['message'],
      enabled: true,
      handler: handlerMock,
    };

    manager.register(plugin);

    const context: PluginContext = {
      eventId: 'evt-123',
      timestamp: new Date(),
      tenantId: 'tenant-1',
      phoneNumber: '5541999999999',
      data: { text: 'Hello' },
    };

    const results = await manager.execute('message', context);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(handlerMock).toHaveBeenCalledWith(context);
  });

  it('deve parar propagação quando plugin solicitar', async () => {
    const plugin1: Plugin = {
      id: 'plugin-1',
      name: 'Plugin 1',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true, stopPropagation: true }),
    };

    const plugin2: Plugin = {
      id: 'plugin-2',
      name: 'Plugin 2',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    manager.register(plugin1);
    manager.register(plugin2);

    const context: PluginContext = {
      eventId: 'evt-123',
      timestamp: new Date(),
      tenantId: 'tenant-1',
      phoneNumber: '5541999999999',
      data: { text: 'Hello' },
    };

    const results = await manager.execute('message', context);

    expect(results).toHaveLength(1); // Apenas plugin-1 executou
    expect(plugin2.handler).not.toHaveBeenCalled();
  });

  it('deve capturar erro de plugin', async () => {
    const plugin: Plugin = {
      id: 'error-plugin',
      name: 'Error Plugin',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockRejectedValue(new Error('Plugin error')),
    };

    manager.register(plugin);

    const context: PluginContext = {
      eventId: 'evt-123',
      timestamp: new Date(),
      tenantId: 'tenant-1',
      phoneNumber: '5541999999999',
      data: { text: 'Hello' },
    };

    const results = await manager.execute('message', context);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Plugin error');
  });

  it('deve retornar status do plugin manager', () => {
    const plugin1: Plugin = {
      id: 'plugin-1',
      name: 'Plugin 1',
      events: ['message'],
      enabled: true,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    const plugin2: Plugin = {
      id: 'plugin-2',
      name: 'Plugin 2',
      events: ['message'],
      enabled: false,
      handler: vi.fn().mockResolvedValue({ success: true }),
    };

    manager.register(plugin1);
    manager.register(plugin2);

    const status = manager.getStatus();

    expect(status.total).toBe(2);
    expect(status.enabled).toBe(1);
    expect(status.disabled).toBe(1);
  });
});