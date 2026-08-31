import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { BookingService } from './booking.service';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';

@Module({
  providers: [CatalogService, AvailabilityService, BookingService, InventoryService],
  exports: [CatalogService, AvailabilityService, BookingService, InventoryService],
})
export class CoreModule {}
