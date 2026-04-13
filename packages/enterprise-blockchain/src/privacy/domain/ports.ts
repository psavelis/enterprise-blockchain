import type { ReadonlyStore } from "../../shared/store.js";
import type { PurchaseOrder } from "./entities.js";

export interface OrderRepository {
  readonly orders: ReadonlyStore<string, PurchaseOrder>;
  addOrder(order: PurchaseOrder): void;
}
