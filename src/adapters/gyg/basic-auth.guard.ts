import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Request } from 'express';

// GetYourGuide contract: HTTP Basic. Failure -> their error dialect.
@Injectable()
export class GygBasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('Authorization') ?? '';
    const expected =
      'Basic ' +
      Buffer.from(`${process.env.GYG_USER ?? 'gyg'}:${process.env.GYG_PASSWORD ?? 'gyg-secret'}`).toString('base64');
    if (header !== expected) {
      throw new HttpException(
        { errorCode: 'AUTHORIZATION_FAILURE', errorMessage: 'Invalid credentials' },
        401,
      );
    }
    return true;
  }
}
