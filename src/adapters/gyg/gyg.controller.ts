import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { AvailabilityService } from '../../core/availability.service';
import { BookingService } from '../../core/booking.service';
import { CatalogService } from '../../core/catalog.service';
import { CoreError, Product, TicketCategory } from '../../core/model';
import { GygBasicAuthGuard } from './basic-auth.guard';

// GetYourGuide supplier surface, built from their published YAML
// (supplier-api-supplier-endpoints.yaml). SHAPE-LEVEL ONLY until we can run
// their Integrator Portal self-test against it -- treat every response here
// as unverified against their real client.
//
// Known adapter decision (finding for CHAT-190): GYG uses a CLOSED category
// enum. Core categories with standardCategory=null (e.g. "Resident") are NOT
// exposed on this surface -- they simply don't exist for GYG. The Tiqets
// surface exposes them fine. This asymmetry is the category-mapping problem
// made concrete.

// GYG validates that an availability entry carries EITHER "vacancies" OR
// "vacanciesByCategory", never both -- their published YAML says "optional",
// the live validator says XOR (finding for CHAT-190). Which one to send is a
// per-product choice made on GYG's side ("Total Availabilities" vs
// "Availability By Ticket Category"), so it lives here in the adapter.
const AVAILABILITY_TYPE_BY_PRODUCT: Record<string, 'TOTAL' | 'BY_CATEGORY'> = {
  'MUSEUM-ENTRY': 'TOTAL',
  'CABLE-CAR': 'TOTAL',
  'THEATRE-SHOW': 'TOTAL',
};

function gygError(errorCode: string, errorMessage: string, status = 400): HttpException {
  return new HttpException({ errorCode, errorMessage }, status);
}

@Controller('1')
@UseGuards(GygBasicAuthGuard)
export class GygController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
  ) {}

  private mappedCategories(product: Product): TicketCategory[] {
    return product.categories.filter((c) => c.standardCategory !== null);
  }

  private categoryByEnum(product: Product, gygCategory: string): TicketCategory {
    const category = this.mappedCategories(product).find((c) => c.standardCategory === gygCategory);
    if (!category) throw gygError('INVALID_TICKET_CATEGORY', `Category ${gygCategory} not available for this product`);
    return category;
  }

  @Get('suppliers/:supplierId/products')
  listProducts(@Param('supplierId') supplierId: string) {
    return {
      data: {
        products: this.catalog.list().map((p) => ({
          productId: p.id,
          title: p.name,
          description: p.description,
          hasTimeSlots: p.usesTimeslots,
        })),
      },
    };
  }

  @Get('products/:productId/pricing-categories')
  pricingCategories(@Param('productId') productId: string) {
    const product = this.getProductOrThrow(productId);
    return {
      data: {
        pricingCategories: this.mappedCategories(product).map((c) => ({
          category: c.standardCategory,
          price: c.price.amountMinor, // integer, smallest currency unit -- their convention
          currency: c.price.currency,
        })),
      },
    };
  }

  @Get('products/:productId/addons')
  addons(@Param('productId') productId: string) {
    this.getProductOrThrow(productId);
    return { data: { addons: [] } };
  }

  @Get('products/:productId')
  productDetail(@Param('productId') productId: string) {
    const p = this.getProductOrThrow(productId);
    return {
      data: {
        productId: p.id,
        title: p.name,
        description: p.description,
        hasTimeSlots: p.usesTimeslots,
      },
    };
  }

  @Get('get-availabilities')
  getAvailabilities(
    @Query('productId') productId?: string,
    @Query('fromDateTime') fromDateTime?: string,
    @Query('toDateTime') toDateTime?: string,
  ) {
    // Deliberately stricter than the old EB endpoint: productId and a bounded
    // range are REQUIRED. Unbounded scans are how getEbAvailabilities became
    // the heaviest query on the production database.
    if (!productId || !fromDateTime || !toDateTime) {
      throw gygError('VALIDATION_FAILURE', 'productId, fromDateTime and toDateTime are required');
    }
    const product = this.getProductOrThrow(productId);
    const slots = this.availability.getAvailability(productId, fromDateTime.slice(0, 10), toDateTime.slice(0, 10));
    const mapped = this.mappedCategories(product);
    return {
      data: {
        availabilities: slots.map((slot) => ({
          dateTime: `${slot.dateTime}:00`,
          productId: product.id,
          ...(AVAILABILITY_TYPE_BY_PRODUCT[product.id] === 'BY_CATEGORY'
            ? {
                vacanciesByCategory: slot.perCategory
                  .filter(({ category }) => category.standardCategory !== null)
                  .map(({ category, available }) => ({ category: category.standardCategory, vacancies: available })),
              }
            : {
                vacancies: slot.perCategory
                  .filter(({ category }) => category.standardCategory !== null)
                  .reduce((sum, c) => sum + c.available, 0),
              }),
          cutoffSeconds: 0,
          ...(!product.usesTimeslots && product.openingHours
            ? { openingTimes: [{ fromTime: product.openingHours.fromTime, toTime: product.openingHours.toTime }] }
            : {}),
          currency: mapped[0]?.price.currency ?? 'EUR',
          pricesByCategory: {
            retailPrices: mapped.map((c) => ({ category: c.standardCategory, price: c.price.amountMinor })),
          },
        })),
      },
    };
  }

  @Post('reserve')
  @HttpCode(200)
  reserve(@Body() body: any) {
    const data = body?.data ?? {};
    if (!data.productId || !data.dateTime || !data.gygBookingReference || !data.bookingItems?.length) {
      throw gygError('VALIDATION_FAILURE', 'productId, dateTime, gygBookingReference and bookingItems are required');
    }
    const product = this.getProductOrThrow(data.productId);
    try {
      const hold = this.booking.hold(
        product.id,
        String(data.dateTime).slice(0, 16),
        (data.bookingItems as any[]).map((item) => ({
          categoryId: this.categoryByEnum(product, item.category).id,
          quantity: Number(item.count),
        })),
      );
      return {
        data: {
          reservationReference: hold.id,
          reservationExpiration: hold.expiresAt.toISOString(),
        },
      };
    } catch (e) {
      throw this.translate(e);
    }
  }

  @Post('cancel-reservation')
  @HttpCode(200)
  cancelReservation(@Body() body: any) {
    const reference = body?.data?.reservationReference;
    if (!reference) throw gygError('VALIDATION_FAILURE', 'reservationReference is required');
    try {
      this.booking.releaseHold(reference);
    } catch (e) {
      throw this.translate(e);
    }
    return { data: {} };
  }

  @Post('book')
  @HttpCode(200)
  book(@Body() body: any) {
    const data = body?.data ?? {};
    if (!data.reservationReference || !data.gygBookingReference) {
      throw gygError('VALIDATION_FAILURE', 'reservationReference and gygBookingReference are required');
    }
    const travelers = (data.travelers as any[]) ?? [];
    const main = travelers[0];
    try {
      const confirmed = this.booking.confirm(
        data.reservationReference,
        String(data.gygBookingReference),
        main
          ? { firstName: main.firstName, lastName: main.lastName, email: main.email, phone: main.phoneNumber }
          : undefined,
      );
      const product = this.catalog.get(confirmed.productId);
      return {
        data: {
          bookingReference: confirmed.id,
          tickets: confirmed.tickets.map((ticket) => ({
            category: product.categories.find((c) => c.id === ticket.categoryId)?.standardCategory ?? 'ADULT',
            ticketCode: ticket.code,
            ticketCodeType: 'QR_CODE',
          })),
        },
      };
    } catch (e) {
      throw this.translate(e);
    }
  }

  @Post('cancel-booking')
  @HttpCode(200)
  cancelBooking(@Body() body: any) {
    const reference = body?.data?.bookingReference;
    if (!reference) throw gygError('VALIDATION_FAILURE', 'bookingReference is required');
    try {
      this.booking.cancel(reference);
    } catch (e) {
      throw this.translate(e);
    }
    return { data: {} };
  }

  @Post('notify')
  @HttpCode(200)
  notify(@Body() body: any) {
    // Inbound: GYG tells us a product was deactivated on their side.
    // Spike behaviour: acknowledge and log. Real behaviour: flag the channel
    // connection as "Needs attention" (PRD Story 1) and surface it.
    // eslint-disable-next-line no-console
    console.log('[gyg] product deactivation notice', JSON.stringify(body?.data ?? {}));
    return { data: {} };
  }

  private getProductOrThrow(productId: string): Product {
    if (!this.catalog.exists(productId)) throw gygError('INVALID_PRODUCT', `Unknown product ${productId}`);
    return this.catalog.get(productId);
  }

  private translate(e: unknown): HttpException | Error {
    if (e instanceof HttpException) return e;
    if (e instanceof CoreError) {
      switch (e.code) {
        case 'NO_AVAILABILITY':
          return gygError('NO_AVAILABILITY', e.message);
        case 'HOLD_NOT_FOUND':
        case 'HOLD_EXPIRED':
          return gygError('INVALID_RESERVATION', e.message);
        case 'CATEGORY_NOT_FOUND':
          return gygError('INVALID_TICKET_CATEGORY', e.message);
        case 'PRODUCT_NOT_FOUND':
          return gygError('INVALID_PRODUCT', e.message);
        default:
          return gygError('VALIDATION_FAILURE', e.message);
      }
    }
    return e as Error;
  }
}
