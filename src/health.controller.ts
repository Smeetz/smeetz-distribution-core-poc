import { Controller, Get } from '@nestjs/common';

// GetYourGuide's integration tester probes the base URL before running
// endpoint tests; anything but a 2xx stops it. Keep this route public.
@Controller()
export class HealthController {
  @Get()
  root() {
    return { status: 'ok', service: 'smeetz-distribution-core' };
  }
}
