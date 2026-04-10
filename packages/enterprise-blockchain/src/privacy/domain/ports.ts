import type { ReadonlyStore } from "../../shared/store";
import type { PurchaseOrder } from "./entities";

export interface OrderRepository {
  readonly orders: ReadonlyStore<string, PurchaseOrder>;
  addOrder(order: PurchaseOrder): void;
}
