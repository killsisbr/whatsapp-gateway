import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookManager } from '../src/webhook.js';
import type { WebhookEvent, WebhookPayload } from '../src/types.js';

describe('WebhookManager', () => {
  let wh: WebhookManager;

  beforeEach(() => {
    wh = new WebhookManager();
  });

  describe('register', () => {
    it('should register a new webhook', () => {
      const reg = wh.register('project-a', 'https://example.com/webhook', ['message', 'status']);

      expect(reg).toHaveProperty('id');
      expect(reg.project).toBe('project-a');
      expect(reg.url).toBe('https://example.com/webhook');
      expect(reg.events).toEqual(['message', 'status']);
      expect(reg).toHaveProperty('createdAt');
    });

    it('should return existing registration for same project+url', () => {
      const first = wh.register('project-a', 'https://example.com/webhook', ['message']);
      const second = wh.register('project-a', 'https://example.com/webhook', ['status']);

      expect(first.id).toBe(second.id);
      expect(first.events).toEqual(['message']);
    });
  });

  describe('remove', () => {
    it('should remove an existing webhook', () => {
      const reg = wh.register('project-a', 'https://example.com/webhook', ['message']);
      const removed = wh.remove(reg.id);

      expect(removed).toBe(true);
      expect(wh.list().length).toBe(0);
    });

    it('should return false for non-existent webhook', () => {
      const removed = wh.remove('non-existent-id');
      expect(removed).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no webhooks registered', () => {
      const list = wh.list();
      expect(list).toEqual([]);
    });

    it('should return all registered webhooks', () => {
      wh.register('project-a', 'https://a.com/hook', ['message']);
      wh.register('project-b', 'https://b.com/hook', ['status']);

      const list = wh.list();
      expect(list.length).toBe(2);
    });
  });

  describe('get', () => {
    it('should get a webhook by id', () => {
      const reg = wh.register('project-a', 'https://example.com/webhook', ['message']);
      const found = wh.get(reg.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(reg.id);
    });

    it('should return undefined for non-existent webhook', () => {
      const found = wh.get('non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('dispatch', () => {
    it('should dispatch event to matching webhooks', async () => {
      wh.register('project-a', 'https://example.com/webhook', ['message', 'status']);
      wh.register('project-b', 'https://other.com/hook', ['disconnect']);

      // Mock fetch para simular sucesso
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
      } as Response));

      await wh.dispatch('message', { from: '123', text: 'hello' });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      global.fetch = originalFetch;
    });

    it('should not dispatch to webhooks not subscribed to event', async () => {
      wh.register('project-a', 'https://example.com/webhook', ['status']);

      const originalFetch = global.fetch;
      global.fetch = vi.fn(async () => ({ ok: true } as Response));

      await wh.dispatch('message', {});

      expect(global.fetch).not.toHaveBeenCalled();

      global.fetch = originalFetch;
    });

    it('should track failed deliveries', async () => {
      wh.register('project-a', 'https://invalid-url.local/webhook', ['message']);

      const originalFetch = global.fetch;
      global.fetch = vi.fn(async () => {
        throw new Error('Network error');
      });

      await wh.dispatch('message', { from: '123', text: 'hello' });

      const failed = wh.getFailedDeliveries();
      expect(failed.length).toBeGreaterThan(0);
      expect(failed[0].webhookId).toBeDefined();
      expect(failed[0].error).toContain('Network error');

      global.fetch = originalFetch;
    });
  });
});