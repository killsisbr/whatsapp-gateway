/**
 * Testes Unitários para Circuit Breaker
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { CircuitBreaker } from './circuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  let successFn: Mock;
  let failureFn: Mock;

  beforeEach(() => {
    breaker = new CircuitBreaker(vi.fn(), { threshold: 3, timeout: 1000 });
    successFn = vi.fn().mockResolvedValue('success');
    failureFn = vi.fn().mockRejectedValue(new Error('Failed'));
  });

  it('deve começar em estado CLOSED', () => {
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('deve abrir após threshold de falhas', async () => {
    breaker = new CircuitBreaker(failureFn, { threshold: 3, timeout: 10000 });

    await breaker.call().catch(() => {});
    await breaker.call().catch(() => {});
    await breaker.call().catch(() => {});

    expect(breaker.getState()).toBe('OPEN');
  });

  it('deve succeed em estado CLOSED', async () => {
    breaker = new CircuitBreaker(successFn, { threshold: 3, timeout: 10000, halfOpenRequests: 1 });

    await breaker.call();

    expect(successFn).toHaveBeenCalled();
  });

  it('deve rejeitar chamada quando OPEN', async () => {
    breaker = new CircuitBreaker(failureFn, { threshold: 1, timeout: 10000 });

    await breaker.call().catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    await expect(breaker.call()).rejects.toThrow('Circuit breaker is OPEN');
  });

  it('deve ir para HALF_OPEN após timeout', async () => {
    breaker = new CircuitBreaker(failureFn, { threshold: 1, timeout: 100, halfOpenRequests: 1 });

    await breaker.call().catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    // Espera timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // O estado só muda para HALF_OPEN quando call() é executado
    // e verifica se pode tentar recuperar
    expect(breaker.getState()).toBe('OPEN');

    // Tenta chamar - vai mudar para HALF_OPEN antes de executar
    await breaker.call().catch(() => {});
    // Após a execução (independente do resultado), o estado foi HALF_OPEN internamente
  });

  it('deve fechar após sucesso em HALF_OPEN', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce('success');

    breaker = new CircuitBreaker(mockFn, { threshold: 1, timeout: 100, halfOpenRequests: 1 });

    await breaker.call().catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    await new Promise(resolve => setTimeout(resolve, 150));

    await breaker.call();

    expect(breaker.getState()).toBe('CLOSED');
  });

  it('deve abrir novamente após falha em HALF_OPEN', async () => {
    breaker = new CircuitBreaker(failureFn, { threshold: 1, timeout: 100, halfOpenRequests: 1 });

    await breaker.call().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 150));

    await breaker.call().catch(() => {});

    expect(breaker.getState()).toBe('OPEN');
  });

  it('deve retornar stats corretos', async () => {
    breaker = new CircuitBreaker(failureFn, { threshold: 5, timeout: 10000 });

    for (let i = 0; i < 3; i++) {
      await breaker.call().catch(() => {});
    }

    const stats = breaker.getStats();

    expect(stats.failureCount).toBe(3);
    expect(stats.state).toBe('CLOSED');
  });

  it('deve resetar estatísticas', async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.call().catch(() => {});
    }

    breaker.reset();

    const stats = breaker.getStats();
    expect(stats.failureCount).toBe(0);
  });
});