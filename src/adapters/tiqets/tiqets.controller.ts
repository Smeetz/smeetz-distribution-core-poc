import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AvailabilityService } from '../../core/availability.service';
import { BookingService } from '../../core/booking.service';
import { CatalogService } from '../../core/catalog.service';
import { CoreError, Product } from '../../core/model';
import { TiqetsApiKeyGuard } from './api-key.guard';
import { tiqetsError } from './tiqets-error';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function money(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

// Tiqets supplier surface: THEIR paths, THEIR shapes, THEIR error strings.
// Everything behind the translation is the shared core.
@Controller('v2')
@UseGuards(TiqetsApiKeyGuard)
export class TiqetsController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
  ) {}

  @Get('products')
  getProducts() {
    return this.catalog.list().map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      use_timeslots: product.usesTimeslots,
      is_refundable: product.refundable,
      provides_pricing: product.providesPricing,
      cutoff_time: product.cancellationCutoffHours,
      ...(product.maxTicketsPerOrder ? { max_tickets_per_order: product.maxTicketsPerOrder } : {}),
    }));
  }

  @Get('products/:product_id/availability')
  getAvailability(
    @Param('product_id') productId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    if (!start) throw tiqetsError(1000, 'Missing argument', 'Required argument "start" was not found');
    if (!end) throw tiqetsError(1000, 'Missing argument', 'Required argument "end" was not found');
    if (!DATE_RE.test(start)) {
      throw tiqetsError(2000, 'Malformed datetime', `Incorrect date format ${start}, please use the YYYY-MM-DD format`);
    }
    if (!DATE_RE.test(end)) {
      throw tiqetsError(2000, 'Malformed datetime', `Incorrect date format ${end}, please use the YYYY-MM-DD format`);
    }
    if (end < start) {
      throw tiqetsError(2001, 'Incorrect date range', 'The end date cannot be earlier than start date');
    }
    if (!this.catalog.exists(productId)) {
      throw tiqetsError(1001, 'Missing product', `Product with ID ${productId} doesn't exist`);
    }

    const product = this.catalog.get(productId);
    const slots = this.availability.getAvailability(productId, start, end);
    const response: Record<string, unknown> = {};
    for (const slot of slots) {
      response[slot.dateTime] = {
        available_tickets: slot.totalAvailable,
        variants: slot.perCategory.map(({ category, available }) => ({
          id: category.id,
          name: category.name,
          available_tickets: available,
          ...(product.providesPricing
            ? { price: { amount: money(category.price.amountMinor), currency: category.price.currency } }
            : {}),
        })),
      };
    }
    return response;
  }

  @Post('products/:product_id/reservation')
  @HttpCode(200)
  postReservation(@Param('product_id') productId: string, @Body() body: any) {
    if (!body?.datetime) throw tiqetsError(1000, 'Missing argument', 'Required argument "datetime" was not found');
    if (!body?.tickets) throw tiqetsError(1000, 'Missing argument', 'Required argument "tickets" was not found');
    if (!body?.customer) throw tiqetsError(1000, 'Missing argument', 'Required argument "customer" was not found');
    if (!this.catalog.exists(productId)) {
      throw tiqetsError(1001, 'Missing product', `Product with ID ${productId} does not exist`);
    }
    if (!DATETIME_RE.test(body.datetime)) {
      throw tiqetsError(
        2000,
        'Malformed datetime',
        `Incorrect date format ${body.datetime}, please use the YYYY-MM-DDTHH:MM format`,
      );
    }
    const today = this.availability.todayLocal();
    if (body.datetime.slice(0, 10) < today) {
      throw tiqetsError(2009, 'Incorrect date', 'Cannot use the past date');
    }

    const product = this.catalog.get(productId);
    let hold;
    try {
      hold = this.booking.hold(
        productId,
        body.datetime,
        (body.tickets as any[]).map((t) => ({ categoryId: String(t.variant_id), quantity: Number(t.quantity) })),
        {
          firstName: body.customer.first_name,
          lastName: body.customer.last_name,
          email: body.customer.email,
          phone: body.customer.phone,
          country: body.customer.country,
        },
      );
    } catch (e) {
      throw this.translate(e);
    }

    return {
      reservation_id: hold.id,
      expires_at: hold.expiresAt.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      ...(product.providesPricing
        ? {
            unit_price: Object.fromEntries(
              hold.items.map((item) => {
                const category = product.categories.find((c) => c.id === item.categoryId)!;
                return [category.id, { amount: money(category.price.amountMinor), currency: category.price.currency }];
              }),
            ),
          }
        : {}),
    };
  }

  @Post('booking')
  @HttpCode(200)
  postBooking(@Body() body: any) {
    if (!body?.reservation_id) {
      throw tiqetsError(1000, 'Missing argument', 'Required argument "reservation_id" was not found');
    }
    let confirmed;
    try {
      confirmed = this.booking.confirm(body.reservation_id, body.order_reference ?? `no-ref-${body.reservation_id}`);
    } catch (e) {
      if (e instanceof CoreError && (e.code === 'HOLD_NOT_FOUND' || e.code === 'HOLD_EXPIRED')) {
        throw tiqetsError(3002, 'Incorrect reservation ID', 'Given reservation ID is incorrect');
      }
      throw this.translate(e);
    }

    const tickets: Record<string, string[]> = {};
    for (const ticket of confirmed.tickets) {
      (tickets[ticket.categoryId] ??= []).push(ticket.code);
    }
    return {
      booking_id: confirmed.id,
      barcode_format: 'QRCODE',
      barcode_scope: 'ticket',
      tickets,
    };
  }

  @Delete('booking/:booking_id')
  @HttpCode(204)
  deleteBooking(@Param('booking_id') bookingId: string) {
    try {
      this.booking.cancel(bookingId);
    } catch (e) {
      if (e instanceof CoreError) {
        switch (e.code) {
          case 'BOOKING_NOT_FOUND':
            throw tiqetsError(1004, 'Missing booking', `Booking with ID ${bookingId} doesn't exist`);
          case 'ALREADY_CANCELLED':
            throw tiqetsError(3003, 'Already cancelled', `The booking with ID ${bookingId} was already cancelled`);
          case 'NOT_REFUNDABLE':
            throw tiqetsError(
              3004,
              'Cancellation not possible',
              'The booking cannot be cancelled, the product does not allow cancellations',
            );
          case 'CUTOFF_PASSED':
            throw tiqetsError(2009, 'Incorrect date', `The booking can only be cancelled ${e.message} hours in advance`);
        }
      }
      throw this.translate(e);
    }
  }

  private translate(e: unknown) {
    if (e instanceof CoreError) {
      switch (e.code) {
        case 'PRODUCT_NOT_FOUND':
          return tiqetsError(1001, 'Missing product', e.message);
        case 'CATEGORY_NOT_FOUND':
          return tiqetsError(2002, 'Incorrect variant', e.message);
        case 'NO_AVAILABILITY':
          return tiqetsError(3000, 'No availability', e.message);
        default:
          return tiqetsError(3999, 'Request processing failed', e.message);
      }
    }
    return e as Error;
  }
}
