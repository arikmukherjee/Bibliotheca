export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ExternalServiceError extends Error {
  readonly service: string;

  constructor(service: string, message: string) {
    super(message);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function notFound(message = 'Resource not found'): never {
  throw new HttpError(404, 'NOT_FOUND', message);
}

export function badRequest(message: string, details?: unknown): never {
  throw new HttpError(400, 'BAD_REQUEST', message, details);
}

export function conflict(message: string, details?: unknown): never {
  throw new HttpError(409, 'CONFLICT', message, details);
}
