import { createHash } from "node:crypto";
import * as dgram from "node:dgram";

import type { HsmAuditEntry } from "../domain/entities.js";
import type { AuditLog } from "../domain/ports.js";

/**
 * Syslog severity levels per RFC 5424.
 */
export type SyslogSeverity =
  | "emergency"
  | "alert"
  | "critical"
  | "error"
  | "warning"
  | "notice"
  | "info"
  | "debug";

/**
 * Syslog facility codes per RFC 5424.
 */
export type SyslogFacility =
  | "kern"
  | "user"
  | "mail"
  | "daemon"
  | "auth"
  | "syslog"
  | "lpr"
  | "news"
  | "uucp"
  | "cron"
  | "authpriv"
  | "ftp"
  | "local0"
  | "local1"
  | "local2"
  | "local3"
  | "local4"
  | "local5"
  | "local6"
  | "local7";

const FACILITY_CODES: Record<SyslogFacility, number> = {
  kern: 0,
  user: 1,
  mail: 2,
  daemon: 3,
  auth: 4,
  syslog: 5,
  lpr: 6,
  news: 7,
  uucp: 8,
  cron: 9,
  authpriv: 10,
  ftp: 11,
  local0: 16,
  local1: 17,
  local2: 18,
  local3: 19,
  local4: 20,
  local5: 21,
  local6: 22,
  local7: 23,
};

const SEVERITY_CODES: Record<SyslogSeverity, number> = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

export interface SyslogConfig {
  /** Syslog server hostname or IP address. Default: "127.0.0.1" */
  host: string;
  /** Syslog server port. Default: 514 */
  port: number;
  /** Syslog facility. Default: "auth" (security/authorization) */
  facility: SyslogFacility;
  /** Application name for syslog messages. Default: "hsm-audit" */
  appName: string;
  /** Protocol: UDP or TCP. Default: "udp" */
  protocol: "udp" | "tcp";
}

export const DEFAULT_SYSLOG_CONFIG: SyslogConfig = {
  host: "127.0.0.1",
  port: 514,
  facility: "auth",
  appName: "hsm-audit",
  protocol: "udp",
};

/**
 * Syslog audit log adapter for enterprise SIEM integration.
 *
 * Sends HSM audit entries to a syslog server using RFC 5424 format.
 * Also maintains an in-memory cache for the entries() API contract.
 *
 * Severity mapping:
 * - "success" → info
 * - "failed" → warning
 *
 * Ref: RFC 5424 — The Syslog Protocol
 * Ref: NIST SP 800-57 Part 1, §8.1 — key management lifecycle auditing
 */
export class SyslogAuditLog implements AuditLog {
  private readonly config: SyslogConfig;
  private readonly cache: HsmAuditEntry[] = [];
  private socket: dgram.Socket | null = null;
  private sequenceNumber = 0;

  constructor(config: Partial<SyslogConfig> = {}) {
    this.config = { ...DEFAULT_SYSLOG_CONFIG, ...config };
  }

  record(
    operation: string,
    keyLabel: string,
    result: "success" | "failed",
    detail?: string,
  ): void {
    this.sequenceNumber++;

    const entry: HsmAuditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      keyLabel,
      result,
    };
    if (detail !== undefined) {
      entry.detail = detail;
    }

    this.cache.push(entry);
    this.sendToSyslog(entry);
  }

  entries(): readonly HsmAuditEntry[] {
    return [...this.cache];
  }

  /**
   * Close the UDP socket if open.
   */
  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private sendToSyslog(entry: HsmAuditEntry): void {
    const severity: SyslogSeverity =
      entry.result === "success" ? "info" : "warning";
    const message = this.formatSyslogMessage(entry, severity);

    if (this.config.protocol === "udp") {
      this.sendUdp(message);
    }
    // TCP support can be added later if needed
  }

  private formatSyslogMessage(
    entry: HsmAuditEntry,
    severity: SyslogSeverity,
  ): string {
    const priority =
      FACILITY_CODES[this.config.facility] * 8 + SEVERITY_CODES[severity];
    const timestamp = entry.timestamp;
    const hostname = "-"; // NILVALUE per RFC 5424
    const appName = this.config.appName;
    const procId = process.pid.toString();
    const msgId = `HSM_${entry.operation.toUpperCase()}`;

    // Structured data with audit details
    const entryHash = this.computeEntryHash(entry);
    const structuredData =
      `[hsm-audit@32473 operation="${entry.operation}" ` +
      `keyLabel="${entry.keyLabel}" result="${entry.result}" ` +
      `sequence="${this.sequenceNumber}" hash="${entryHash.slice(0, 16)}"]`;

    // Human-readable message
    const message = entry.detail
      ? `${entry.operation} ${entry.keyLabel}: ${entry.result} - ${entry.detail}`
      : `${entry.operation} ${entry.keyLabel}: ${entry.result}`;

    // RFC 5424 format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG
    return `<${priority}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${message}`;
  }

  private computeEntryHash(entry: HsmAuditEntry): string {
    const payload = JSON.stringify({
      timestamp: entry.timestamp,
      operation: entry.operation,
      keyLabel: entry.keyLabel,
      result: entry.result,
      detail: entry.detail,
      sequenceNumber: this.sequenceNumber,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  private sendUdp(message: string): void {
    if (!this.socket) {
      this.socket = dgram.createSocket("udp4");
    }

    const buffer = Buffer.from(message, "utf-8");
    this.socket.send(
      buffer,
      0,
      buffer.length,
      this.config.port,
      this.config.host,
      (err) => {
        if (err) {
          // Log to stderr but don't throw — audit logging shouldn't break HSM operations
          console.error(
            `SyslogAuditLog: failed to send to ${this.config.host}:${this.config.port}: ${err.message}`,
          );
        }
      },
    );
  }
}
