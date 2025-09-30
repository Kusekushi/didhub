export class ApiError<T = unknown> extends Error {
  readonly status: number;
  readonly data: T | undefined;
  readonly response: Response;
  readonly url: string;

  constructor(message: string, options: { status: number; data?: T; response: Response; url: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.data = options.data;
    this.response = options.response;
    this.url = options.url;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
