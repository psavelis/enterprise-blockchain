// Re-export shared crypto primitives so existing intra-module imports keep working.
export { sha256hex, commitShare } from "../../shared/src/index";
