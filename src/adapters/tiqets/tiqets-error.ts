import { HttpException } from '@nestjs/common';

// Tiqets error dialect: 400 + {error_code, error, message}.
// Strings must match the official supplier_api_tester EXACTLY -- they are asserted.
export function tiqetsError(errorCode: number, error: string, message: string): HttpException {
  return new HttpException({ error_code: errorCode, error, message }, 400);
}
