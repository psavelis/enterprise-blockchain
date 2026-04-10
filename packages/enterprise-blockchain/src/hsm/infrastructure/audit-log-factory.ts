import type { AuditLog } from "../domain/ports.js";
import { InMemoryAuditLog } from "./audit-log.js";
import { FileAuditLog } from "./file-audit-log.js";
import { SyslogAuditLog, type SyslogConfig } from "./syslog-audit-log.js";

/**
 * Audit log adapter types supported by the factory.
 */
export type AuditLogType = "memory" | "file" | "syslog";

/**
 * Configuration for creating audit log instances.
 */
export interface AuditLogFactoryConfig {
  /** Type of audit log adapter. Default: "memory" */
  type: AuditLogType;
  /** File path for FileAuditLog (required when type is "file") */
  filePath?: string;
  /** Syslog configuration for SyslogAuditLog (optional when type is "syslog") */
  syslogConfig?: Partial<SyslogConfig>;
}

/**
 * Environment variable names for audit log configuration.
 */
export const AUDIT_LOG_ENV = {
  TYPE: "HSM_AUDIT_LOG_TYPE",
  FILE_PATH: "HSM_AUDIT_LOG_PATH",
  SYSLOG_HOST: "HSM_SYSLOG_HOST",
  SYSLOG_PORT: "HSM_SYSLOG_PORT",
  SYSLOG_FACILITY: "HSM_SYSLOG_FACILITY",
  SYSLOG_APP_NAME: "HSM_SYSLOG_APP_NAME",
} as const;

/**
 * Factory for creating audit log instances based on configuration.
 *
 * Supports three adapter types:
 * - "memory": In-memory (default, for development/testing)
 * - "file": Append-only file with cryptographic chaining
 * - "syslog": RFC 5424 syslog for enterprise SIEM integration
 *
 * Configuration can be provided via:
 * - Direct config object
 * - Environment variables (for production)
 */
export class AuditLogFactory {
  /**
   * Create an audit log instance from explicit configuration.
   */
  static create(config: AuditLogFactoryConfig): AuditLog {
    switch (config.type) {
      case "memory":
        return new InMemoryAuditLog();

      case "file":
        if (!config.filePath) {
          throw new Error(
            "AuditLogFactory: filePath is required when type is 'file'",
          );
        }
        return new FileAuditLog(config.filePath);

      case "syslog":
        return new SyslogAuditLog(config.syslogConfig);

      default:
        throw new Error(
          `AuditLogFactory: unknown audit log type '${config.type as string}'`,
        );
    }
  }

  /**
   * Create an audit log instance from environment variables.
   *
   * Environment variables:
   * - HSM_AUDIT_LOG_TYPE: "memory" | "file" | "syslog" (default: "memory")
   * - HSM_AUDIT_LOG_PATH: file path for FileAuditLog
   * - HSM_SYSLOG_HOST: syslog server hostname
   * - HSM_SYSLOG_PORT: syslog server port
   * - HSM_SYSLOG_FACILITY: syslog facility name
   * - HSM_SYSLOG_APP_NAME: application name for syslog
   */
  static createFromEnv(env: NodeJS.ProcessEnv = process.env): AuditLog {
    const type = (env[AUDIT_LOG_ENV.TYPE] as AuditLogType) || "memory";

    const config: AuditLogFactoryConfig = { type };

    if (type === "file") {
      const filePath = env[AUDIT_LOG_ENV.FILE_PATH];
      if (filePath) {
        config.filePath = filePath;
      }
    }

    if (type === "syslog") {
      const syslogConfig: Partial<SyslogConfig> = {};
      const host = env[AUDIT_LOG_ENV.SYSLOG_HOST];
      if (host) {
        syslogConfig.host = host;
      }
      const port = env[AUDIT_LOG_ENV.SYSLOG_PORT];
      if (port) {
        syslogConfig.port = parseInt(port, 10);
      }
      const facility = env[AUDIT_LOG_ENV.SYSLOG_FACILITY];
      if (facility) {
        syslogConfig.facility = facility as SyslogConfig["facility"];
      }
      const appName = env[AUDIT_LOG_ENV.SYSLOG_APP_NAME];
      if (appName) {
        syslogConfig.appName = appName;
      }
      config.syslogConfig = syslogConfig;
    }

    return this.create(config);
  }
}
