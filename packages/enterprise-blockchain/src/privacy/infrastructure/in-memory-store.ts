import { InMemoryStore } from "../../shared/store.js";
import type { PurchaseOrder } from "../domain/entities.js";
import type { OrderRepository } from "../domain/ports.js";

export class InMemoryOrderRepository implements OrderRepository {
  readonly orders = new InMemoryStore<string, PurchaseOrder>();

  addOrder(order: PurchaseOrder): void {
    this.orders.set(order.id, order);
  }
}
