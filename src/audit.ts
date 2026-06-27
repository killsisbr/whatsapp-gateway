/**
 * Audit Logger - Log de todas as requisições e ações para compliance (LGPD/GDPR)
 *
 * Rastreia:
 * - Todas as requisições API (timestamp, tenant, endpoint, status code)
 * - Criação/deleção de tenants e API keys
 * - Envio de mensagens
 * - Falhas de autenticação
 * - Webhooks disparados
 */

import { randomUUID } from "crypto";
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export type AuditEventType =
  | "api_request"
  | "auth_success"
  | "auth_failure"
  | "session_created"
  | "session_confirmed"
  | "session_rotated"
  | "tenant_created"
  | "tenant_deleted"
  | "apikey_created"
  | "apikey_deleted"
  | "apikey_revoked"
  | "message_sent"
  | "message_failed"
  | "webhook_registered"
  | "webhook_fired"
  | "webhook_failed"
  | "qr_generated"
  | "qr_scanned"
  | "qr_expired"
  | "rate_limit_hit"
  | "security_alert";

export interface AuditLog {
  id: string;           // UUID único do log
  timestamp: string;    // ISO 8601
  event: AuditEventType;
  tenantId?: string;    // Tenant envolvido (se aplicável)
  apiKeyId?: string;    // API key usada (sem expor o valor!)
  endpoint?: string;    // Endpoint REST
  method?: string;      // HTTP method
  statusCode?: number;  // Response status
  ipAddress?: string;   // IP do cliente
  userAgent?: string;   // User-Agent
  details?: unknown;    // Detalhes específicos do evento
  sensitive: boolean;   // Se true, details são redacted em produção
}

export interface AuditLogConfig {
  logDir: string;
  maxAgeDays: number;     // Logs com mais que isso são arquivados
  redactSensitive: boolean; // Redact details em logs sensíveis
  asyncWrite: boolean;    // Buffer writes para performance
  flushInterval: number;  // ms entre flushes do buffer
}

const DEFAULT_CONFIG: AuditLogConfig = {
  logDir: "./logs/audit",
  maxAgeDays: 90,
  redactSensitive: true,
  asyncWrite: true,
  flushInterval: 5000,
};

export class AuditLogger {
  private config: AuditLogConfig;
  private buffer: AuditLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Cria diretório de logs
    const absLogDir = path.resolve(process.cwd(), this.config.logDir);
    if (!existsSync(absLogDir)) {
      mkdirSync(absLogDir, { recursive: true });
    }

    // Auto-flush periódico
    if (this.config.asyncWrite) {
      this.flushTimer = setInterval(
        () => this.flush(),
        this.config.flushInterval
      );

      // Flush no shutdown
      process.on("exit", () => this.flush());
      process.on("SIGINT", () => {
        this.flush();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        this.flush();
        process.exit(0);
      });
    }
  }

  /**
   * Loga um evento de auditoria
   */
  log(event: Omit<AuditLog, "id" | "timestamp">): void {
    const log: AuditLog = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // Redact sensitive data se configurado
    if (this.config.redactSensitive && log.sensitive && log.details) {
      log.details = {
        _redacted: true,
        reason: "Sensitive data - consult admin for access",
      };
    }

    if (this.config.asyncWrite) {
      this.buffer.push(log);
      if (this.buffer.length >= 100) {
        this.flush();
      }
    } else {
      this.writeLog(log);
    }
  }

  /**
   * Logs específicos por tipo de evento
   */

  apiRequest(
    method: string,
    endpoint: string,
    statusCode: number,
    tenantId?: string,
    apiKeyId?: string,
    ipAddress?: string,
    userAgent?: string
  ): void {
    this.log({
      event: "api_request",
      method,
      endpoint,
      statusCode,
      tenantId,
      apiKeyId,
      ipAddress,
      userAgent,
      sensitive: false,
    });
  }

  authSuccess(
    tenantId: string,
    apiKeyId: string,
    ipAddress?: string
  ): void {
    this.log({
      event: "auth_success",
      tenantId,
      apiKeyId,
      ipAddress,
      sensitive: false,
    });
  }

  authFailure(
    apiKeyProvided?: string,
    ipAddress?: string,
    reason?: string
  ): void {
    this.log({
      event: "auth_failure",
      details: { apiKeyProvided: apiKeyProvided ? "[REDACTED]" : undefined, reason },
      ipAddress,
      sensitive: true,
    });
  }

  sessionCreated(sessionToken: string, ipAddress?: string): void {
    this.log({
      event: "session_created",
      details: { sessionToken: "[REDACTED]" },
      ipAddress,
      sensitive: true,
    });
  }

  sessionConfirmed(tenantId: string, ipAddress?: string): void {
    this.log({
      event: "session_confirmed",
      tenantId,
      ipAddress,
      sensitive: false,
    });
  }

  messageSent(
    tenantId: string,
    to: string,
    messageId?: string,
    error?: string
  ): void {
    this.log({
      event: error ? "message_failed" : "message_sent",
      tenantId,
      details: { to, messageId, error },
      sensitive: false,
    });
  }

  securityAlert(
    type: string,
    severity: "low" | "medium" | "high" | "critical",
    details: unknown,
    tenantId?: string,
    ipAddress?: string
  ): void {
    this.log({
      event: "security_alert",
      tenantId,
      ipAddress,
      details: { type, severity, extra: details },
      sensitive: true,
    });
  }

  /**
   * Busca logs por período e filtros
   */
  search(filters: {
    startDate?: string;
    endDate?: string;
    event?: AuditEventType;
    tenantId?: string;
    minSeverity?: "low" | "medium" | "high" | "critical";
    limit?: number;
  }): AuditLog[] {
    const absLogDir = path.resolve(process.cwd(), this.config.logDir);
    const logFiles = existsSync(absLogDir)
      ? readdirSafe(absLogDir).filter(f => f.endsWith(".jsonl"))
      : [];

    const results: AuditLog[] = [];
    const limit = filters.limit ?? 1000;

    for (const file of logFiles) {
      if (results.length >= limit) break;

      const filePath = path.join(absLogDir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter(line => line.trim());

        for (const line of lines) {
          try {
            const log: AuditLog = JSON.parse(line);

            // Aplica filtros
            if (filters.startDate && log.timestamp < filters.startDate) continue;
            if (filters.endDate && log.timestamp > filters.endDate) continue;
            if (filters.event && log.event !== filters.event) continue;
            if (filters.tenantId && log.tenantId !== filters.tenantId) continue;

            results.push(log);
            if (results.length >= limit) break;
          } catch {
            // Ignora linha inválida
          }
        }
      } catch {
        // Ignora arquivo inválido
      }
    }

    return results;
  }

  /**
   * Exporta logs para JSON (útil para auditoria externa)
   */
  export(filters: {
    startDate?: string;
    endDate?: string;
    format?: "json" | "csv";
  }): string {
    const logs = this.search(filters);

    if (filters.format === "csv") {
      const headers = ["id", "timestamp", "event", "tenantId", "endpoint", "statusCode", "ipAddress"];
      const rows = logs.map(log =>
        headers.map(h => JSON.stringify((log as any)[h] || "")).join(",")
      );
      return [headers.join(","), ...rows].join("\n");
    }

    return JSON.stringify(logs, null, 2);
  }

  /**
   * Flush do buffer para disco
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    const logs = [...this.buffer];
    this.buffer = [];

    for (const log of logs) {
      this.writeLog(log);
    }
  }

  /**
   * Escreve um log individual no arquivo diário
   */
  private writeLog(log: AuditLog): void {
    const date = log.timestamp.split("T")[0]; // YYYY-MM-DD
    const absLogDir = path.resolve(process.cwd(), this.config.logDir);
    const logFile = path.join(absLogDir, `audit-${date}.jsonl`);

    const line = JSON.stringify(log) + "\n";
    appendFileSync(logFile, line, { encoding: "utf-8" });
  }

  /**
   * Stats do audit log
   */
  getStats(): {
    totalLogsToday: number;
    bufferSize: number;
    logFilesCount: number;
  } {
    const today = new Date().toISOString().split("T")[0];
    const absLogDir = path.resolve(process.cwd(), this.config.logDir);

    let totalToday = 0;
    try {
      const todayFile = path.join(absLogDir, `audit-${today}.jsonl`);
      if (existsSync(todayFile)) {
        const content = readFileSync(todayFile, "utf-8");
        totalToday = content.split("\n").filter(line => line.trim()).length;
      }
    } catch {
      // Ignora erro
    }

    return {
      totalLogsToday: totalToday,
      bufferSize: this.buffer.length,
      logFilesCount: existsSync(absLogDir)
        ? readdirSafe(absLogDir).filter(f => f.endsWith(".jsonl")).length
        : 0,
    };
  }
}

// Helper para readdir sem crashar
function readdirSafe(dir: string): string[] {
  try {
    return require("node:fs").readdirSync(dir);
  } catch {
    return [];
  }
}

// Singleton export
export const auditLogger = new AuditLogger();
export default auditLogger;