import { InMemoryStore } from "../../../shared/src/store";
import type { PurchaseOrder } from "../domain/entities";
import type { OrderRepository } from "../domain/ports";

export class InMemoryOrderRepository implements OrderRepository {
  readonly orders = new InMemoryStore<string, PurchaseOrder>();

  addOrder(order: PurchaseOrder): void {
    this.orders.set(order.id, order);
  }
}
