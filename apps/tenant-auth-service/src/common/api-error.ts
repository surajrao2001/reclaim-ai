import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    trace_id: string;
    retryable: boolean;
  };
}

export function apiError(
  status: HttpStatus,
  code: string,
  message: string,
  retryable = false,
): HttpException {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      trace_id: crypto.randomUUID(),
      retryable,
    },
  };
  return new HttpException(body, status);
}
