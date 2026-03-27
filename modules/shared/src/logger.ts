/**
 * Minimal structured logging port.
 *
 * Domain modules accept an optional Logger instance via constructor injection.
 * When no logger is provided, operations run silently (zero behavior change).
 * Teams can swap in Pino, Winston, or OpenTelemetry at integration time.
 */
export interface LogFields {
  operation?: string;
  entityId?: string;
  result?: string;
  durationMs?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/**
 * No-op logger that silently discards all messages.
 * Used as the default when no logger is provided.
 */
export const noopLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

/**
 * Simple console-based structured logger.
 * Outputs JSON lines for machine consumption.
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string;

  constructor(prefix = "") {
    this.prefix = prefix;
  }

  info(msg: string, fields?: LogFields): void {
    this.log("info", msg, fields);
  }

  warn(msg: string, fields?: LogFields): void {
    this.log("warn", msg, fields);
  }

  error(msg: string, fields?: LogFields): void {
    this.log("error", msg, fields);
  }

  private log(level: string, msg: string, fields?: LogFields): void {
    // Spread caller fields first, then apply reserved keys so they cannot
    // be accidentally overridden by user-supplied LogFields.
    const entry = {
      ...fields,
      level,
      ts: new Date().toISOString(),
      ...(this.prefix ? { module: this.prefix } : {}),
      msg,
    };
    const writer =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;
    writer(JSON.stringify(entry));
  }
}
