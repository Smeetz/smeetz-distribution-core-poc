import { Injectable } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { AvailabilitySlot } from './model';
import { InventoryService } from './inventory.service';

const MAX_WINDOW_DAYS = 366; // hard bound: a huge range must never become a huge scan

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
  ) {}

  // from/to are inclusive "YYYY-MM-DD", venue-local.
  // Past dates are silently excluded, never an error (Tiqets contract).
  getAvailability(productId: string, from: string, to: string): AvailabilitySlot[] {
    const product = this.catalog.get(productId);
    const today = this.todayLocal();
    const start = from > today ? from : today;
    const slots: AvailabilitySlot[] = [];

    let day = start;
    let steps = 0;
    while (day <= to && steps < MAX_WINDOW_DAYS) {
      if (product.closedDates.includes(day)) {
        day = this.nextDay(day);
        steps += 1;
        continue;
      }
      for (const time of product.timeslots) {
        const dateTime = `${day}T${time}`;
        const perCategory = product.categories.map((category) => ({
          category,
          available: this.inventory.available(product, dateTime, category.id),
        }));
        const totalAvailable = perCategory.reduce((sum, c) => sum + c.available, 0);
        slots.push({ dateTime, totalAvailable, perCategory });
      }
      day = this.nextDay(day);
      steps += 1;
    }
    return slots;
  }

  todayLocal(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private nextDay(day: string): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
}
