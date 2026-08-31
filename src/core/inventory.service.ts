import { Injectable } from '@nestjs/common';
import { Product } from './model';

// The single capacity counter. Everything that sells a seat -- any channel --
// goes through here. This is what prevents two channels selling the same seat.
@Injectable()
export class InventoryService {
  // key: productId|dateTime|categoryId -> committed quantity (holds + bookings)
  private readonly committed = new Map<string, number>();

  private key(productId: string, dateTime: string, categoryId: string): string {
    return `${productId}|${dateTime}|${categoryId}`;
  }

  available(product: Product, dateTime: string, categoryId: string): number {
    const used = this.committed.get(this.key(product.id, dateTime, categoryId)) ?? 0;
    return Math.max(0, product.baseCapacityPerSlot - used);
  }

  commit(productId: string, dateTime: string, categoryId: string, quantity: number): void {
    const k = this.key(productId, dateTime, categoryId);
    this.committed.set(k, (this.committed.get(k) ?? 0) + quantity);
  }

  release(productId: string, dateTime: string, categoryId: string, quantity: number): void {
    const k = this.key(productId, dateTime, categoryId);
    this.committed.set(k, Math.max(0, (this.committed.get(k) ?? 0) - quantity));
  }
}
