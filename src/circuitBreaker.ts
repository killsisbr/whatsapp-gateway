/**
 * Circuit Breaker para Webhooks
 *
 * Previne cascata de falhas quando o destino está indisponível
 *
 * Estados:
 * - CLOSED: Normal, requests passam
 * - OPEN: Circuito aberto, requests falham imediatamente
 * - HALF_OPEN: Testando recuperação
 */

export interface CircuitBreakerOptions {
  threshold: number;       // Falhas para abrir o circuito
  timeout: number;         // Tempo em ms antes de tentar recuperação
  halfOpenRequests: number; // Requests permitidos no half-open
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker<T extends unknown[] = unknown[]> {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private execute: (...args: T) => Promise<void>,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = {
      threshold: 5,
      timeout: 30000,
      halfOpenRequests: 3,
      ...options,
    };
  }

  async call(...args: T): Promise<void> {
    if (this.state === CircuitState.OPEN) {
      // Verifica se já pode tentar recuperar
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      await this.execute(...args);
      this.onSuccess();
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenRequests!) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.threshold!) {
      this.state = CircuitState.OPEN;
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) return true;
    return Date.now() - this.lastFailureTime >= this.options.timeout!;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): {
    state: string;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

export default CircuitBreaker;