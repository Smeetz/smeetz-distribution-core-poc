import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';

// Tiqets auth. NOTE (finding): the published spec says 403 with an EMPTY body,
// but the official supplier_api_tester asserts this exact plain-text message.
// The tester is the certification gate, so the tester wins.
@Injectable()
export class TiqetsApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header('API-Key') === (process.env.TIQETS_API_KEY ?? 'secret')) {
      return true;
    }
    const response = context.switchToHttp().getResponse<Response>();
    response.status(403).type('text/plain').send('Forbidden - Missing or incorrect API key');
    return false;
  }
}
