import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { Booking, CoreError, CustomerContact, Hold, HoldItem, Ticket } from './model';

const HOLD_TTL_MS = 30 * 60 * 1000; // core policy; EB let the CALLER choose -- deliberate change

@Injectable()
export class BookingService {
  private readonly holds = new Map<string, Hold>();
  private readonly bookings = new Map<string, Booking>();
  // Idempotency: the same channel order reference always returns the same booking.
  private readonly byExternalRef = new Map<string, Booking>();

  constructor(
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
  ) {}

  hold(productId: string, dateTime: string, items: HoldItem[], customer?: CustomerContact): Hold {
    const product = this.catalog.get(productId);

    // The slot must actually exist: not a closed day, and a real start time.
    // Capacity alone is not enough -- a closed day has no counter to exhaust.
    const day = dateTime.slice(0, 10);
    const time = dateTime.slice(11, 16);
    if (product.closedDates.includes(day) || !product.timeslots.includes(time)) {
      throw new CoreError('NO_AVAILABILITY', `No bookable slot at ${dateTime}`);
    }

    for (const item of items) {
      if (!product.categories.some((c) => c.id === item.categoryId)) {
        throw new CoreError('CATEGORY_NOT_FOUND', `Category ${item.categoryId} not on product ${productId}`);
      }
      if (this.inventory.available(product, dateTime, item.categoryId) < item.quantity) {
        throw new CoreError('NO_AVAILABILITY', `Not enough availability for ${item.categoryId} at ${dateTime}`);
      }
    }
    for (const item of items) {
      this.inventory.commit(productId, dateTime, item.categoryId, item.quantity);
    }

    const hold: Hold = {
      id: randomUUID(),
      productId,
      dateTime,
      items,
      customer,
      expiresAt: new Date(Date.now() + HOLD_TTL_MS),
      status: 'PENDING',
    };
    this.holds.set(hold.id, hold);
    return hold;
  }

  releaseHold(holdId: string): void {
    const hold = this.holds.get(holdId);
    if (!hold) throw new CoreError('HOLD_NOT_FOUND', `Hold ${holdId} not found`);
    if (hold.status !== 'PENDING') return; // releasing twice is a no-op, not an error
    hold.status = 'RELEASED';
    for (const item of hold.items) {
      this.inventory.release(hold.productId, hold.dateTime, item.categoryId, item.quantity);
    }
  }

  confirm(holdId: string, externalReference: string, customer?: CustomerContact): Booking {
    // Idempotency first: a retry with the same external reference must not book twice.
    const existing = this.byExternalRef.get(externalReference);
    if (existing) return existing;

    const hold = this.holds.get(holdId);
    if (!hold) throw new CoreError('HOLD_NOT_FOUND', `Hold ${holdId} not found`);
    if (hold.status === 'CONFIRMED') {
      throw new CoreError('HOLD_NOT_FOUND', `Hold ${holdId} already confirmed under another reference`);
    }
    if (hold.status !== 'PENDING' || hold.expiresAt.getTime() < Date.now()) {
      if (hold.status === 'PENDING') {
        hold.status = 'EXPIRED';
        for (const item of hold.items) {
          this.inventory.release(hold.productId, hold.dateTime, item.categoryId, item.quantity);
        }
      }
      throw new CoreError('HOLD_EXPIRED', `Hold ${holdId} expired`);
    }

    hold.status = 'CONFIRMED';
    const tickets: Ticket[] = hold.items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        id: randomUUID(),
        categoryId: item.categoryId,
        code: `SMTZ-${randomUUID()}`,
      })),
    );

    const booking: Booking = {
      id: randomUUID(),
      holdId,
      productId: hold.productId,
      dateTime: hold.dateTime,
      externalReference,
      tickets,
      customer: customer ?? hold.customer,
      cancelled: false,
    };
    this.bookings.set(booking.id, booking);
    this.byExternalRef.set(externalReference, booking);
    return booking;
  }

  cancel(bookingId: string): void {
    const booking = this.bookings.get(bookingId);
    if (!booking) throw new CoreError('BOOKING_NOT_FOUND', `Booking ${bookingId} not found`);
    if (booking.cancelled) throw new CoreError('ALREADY_CANCELLED', `Booking ${bookingId} already cancelled`);

    const product = this.catalog.get(booking.productId);
    if (!product.refundable) {
      throw new CoreError('NOT_REFUNDABLE', `Product ${product.id} does not allow cancellations`);
    }
    if (product.cancellationCutoffHours > 0) {
      const start = new Date(`${booking.dateTime}:00`);
      const cutoff = new Date(start.getTime() - product.cancellationCutoffHours * 3600 * 1000);
      if (new Date() > cutoff) {
        throw new CoreError('CUTOFF_PASSED', `${product.cancellationCutoffHours}`);
      }
    }

    booking.cancelled = true;
    const perCategory = new Map<string, number>();
    for (const ticket of booking.tickets) {
      perCategory.set(ticket.categoryId, (perCategory.get(ticket.categoryId) ?? 0) + 1);
    }
    for (const [categoryId, quantity] of perCategory) {
      this.inventory.release(booking.productId, booking.dateTime, categoryId, quantity);
    }
  }

  getBooking(bookingId: string): Booking | undefined {
    return this.bookings.get(bookingId);
  }
}
