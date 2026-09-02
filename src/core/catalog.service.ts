import { Injectable } from '@nestjs/common';
import { CoreError, Product } from './model';

// Seed data. Deliberately includes:
// - a non-timeslot product (museum) with a category that has NO standard-enum
//   mapping ("Resident") -- makes the category-mapping problem visible
// - a timeslot product (cable car)
// - a non-refundable timeslot product (theatre) -- exercises cancellation rules
@Injectable()
export class CatalogService {
  private readonly products: Product[] = [
    {
      id: 'MUSEUM-ENTRY',
      name: 'Museum general admission',
      description: 'All-day entry to the museum.',
      usesTimeslots: false,
      refundable: true,
      providesPricing: true,
      cancellationCutoffHours: 0,
      maxTicketsPerOrder: 20,
      timeslots: ['00:00'],
      baseCapacityPerSlot: 100,
      closedDates: ['2026-09-15', '2026-09-16'],
      categories: [
        { id: 'MUS-ADULT', name: 'Adult', price: { amountMinor: 1800, currency: 'EUR' }, standardCategory: 'ADULT' },
        { id: 'MUS-CHILD', name: 'Child', price: { amountMinor: 900, currency: 'EUR' }, standardCategory: 'CHILD' },
        // No clean mapping to a closed enum. The GYG adapter must decide.
        { id: 'MUS-RESIDENT', name: 'Resident', price: { amountMinor: 1200, currency: 'EUR' }, standardCategory: null },
      ],
    },
    {
      id: 'CABLE-CAR',
      name: 'Cable car return trip',
      description: 'Return trip, hourly departures.',
      usesTimeslots: true,
      refundable: true,
      providesPricing: false,
      cancellationCutoffHours: 24,
      timeslots: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
      baseCapacityPerSlot: 60,
      closedDates: [],
      categories: [
        { id: 'CAB-ADULT', name: 'Adult', price: { amountMinor: 4500, currency: 'CHF' }, standardCategory: 'ADULT' },
        { id: 'CAB-CHILD', name: 'Child', price: { amountMinor: 2200, currency: 'CHF' }, standardCategory: 'CHILD' },
      ],
    },
    {
      id: 'THEATRE-SHOW',
      name: 'Evening theatre show',
      description: 'Non-refundable evening performance.',
      usesTimeslots: true,
      refundable: false,
      providesPricing: true,
      cancellationCutoffHours: 0,
      timeslots: ['20:00'],
      baseCapacityPerSlot: 200,
      closedDates: [],
      categories: [
        { id: 'THE-STANDARD', name: 'Standard seat', price: { amountMinor: 3500, currency: 'EUR' }, standardCategory: 'ADULT' },
      ],
    },
  ];

  list(): Product[] {
    return this.products;
  }

  get(productId: string): Product {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      throw new CoreError('PRODUCT_NOT_FOUND', `Product ${productId} not found`);
    }
    return product;
  }

  exists(productId: string): boolean {
    return this.products.some((p) => p.id === productId);
  }
}
