export { sha256hex } from "./crypto.js";
export { commitShare, timingSafeCompare } from "./commit.js";
export { daysUntil } from "./date.js";
export type { ReadonlyStore, Store } from "./store.js";
export { InMemoryStore } from "./store.js";
export { CollectionStore } from "./collection-store.js";
export type { Logger, LogFields } from "./logger.js";
export { ConsoleLogger, noopLogger } from "./logger.js";

// NOTE: Telemetry is NOT re-exported here to preserve optional peer dependency.
// @opentelemetry/api is an optional peer dep and importing telemetry.ts at the
// top level would fail when OTEL is not installed. Import telemetry directly:
//   import "@psavelis/enterprise-blockchain/shared/telemetry-sdk";  // SDK init (side-effect)
//   import { createTracer, ... } from "@psavelis/enterprise-blockchain/shared/telemetry";
