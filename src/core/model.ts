// Canonical distribution model. THIS FILE IS THE EXPERIMENT:
// if an adapter forces a change here, that is a finding for CHAT-190.
// Rule: nothing in src/core may reference a channel by name.

export interface Money {
  amountMinor: number; // 1250 = 12.50
  currency: string; // ISO 4217
}

export interface TicketCategory {
  id: string; // stable, never derived from dates or times (Tiqets contract requirement)
  name: string;
  price: Money;
  // Closed-enum hint for channels that need one (e.g. ADULT/CHILD/...).
  // null = no clean mapping exists; each adapter decides what to do with it.
  standardCategory: string | null;
}

export interface Product {
  id: string; // stable external id
  name: string;
  description: string;
  usesTimeslots: boolean;
  refundable: boolean;
  providesPricing: boolean;
  cancellationCutoffHours: number; // 0 = cancellable until start
  maxTicketsPerOrder?: number;
  timeslots: string[]; // "HH:MM" start times; single "00:00" when usesTimeslots=false
  // Opening hours, only meaningful when usesTimeslots=false.
  openingHours?: { fromTime: string; toTime: string };
  categories: TicketCategory[];
  baseCapacityPerSlot: number;
  // Venue-closed days, "YYYY-MM-DD". No availability is generated for them.
  closedDates: string[];
}

export interface AvailabilitySlot {
  dateTime: string; // "YYYY-MM-DDTHH:MM", venue-local
  totalAvailable: number;
  perCategory: { category: TicketCategory; available: number }[];
}

export interface HoldItem {
  categoryId: string;
  quantity: number;
}

export interface Hold {
  id: string;
  productId: string;
  dateTime: string;
  items: HoldItem[];
  customer?: CustomerContact;
  expiresAt: Date;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
}

export interface CustomerContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country?: string;
}

export interface Ticket {
  id: string;
  categoryId: string;
  code: string; // barcode/QR payload, unique
}

export interface Booking {
  id: string;
  holdId: string;
  productId: string;
  dateTime: string;
  externalReference: string; // the channel's own order reference
  tickets: Ticket[];
  customer?: CustomerContact;
  cancelled: boolean;
}

// Core error taxonomy. Adapters translate these to channel dialects; core never
// speaks any channel's error format.
export type CoreErrorCode =
  | 'PRODUCT_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'NO_AVAILABILITY'
  | 'HOLD_NOT_FOUND'
  | 'HOLD_EXPIRED'
  | 'BOOKING_NOT_FOUND'
  | 'ALREADY_CANCELLED'
  | 'NOT_REFUNDABLE'
  | 'CUTOFF_PASSED'
  | 'PAST_DATE'
  | 'VALIDATION';

export class CoreError extends Error {
  constructor(
    public readonly code: CoreErrorCode,
    message: string,
  ) {
    super(message);
  }
}
