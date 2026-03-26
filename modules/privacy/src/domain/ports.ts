import type { ReadonlyStore } from "../../../shared/src/store";
import type { PurchaseOrder } from "./entities";

export interface OrderRepository {
  readonly orders: ReadonlyStore<string, PurchaseOrder>;
  addOrder(order: PurchaseOrder): void;
}
