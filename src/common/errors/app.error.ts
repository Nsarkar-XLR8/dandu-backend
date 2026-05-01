import {
  DomainErrorCategory,
  DomainException,
} from '../domain/exceptions/domain.exception';

/**
 * Custom Application Error class
 * Extends the framework-agnostic domain exception base and is mapped to HTTP
 * by the global exception filter.
 */
export class AppError extends DomainException {
  public readonly errors?: unknown;

  constructor(
    category: DomainErrorCategory,
    message: string,
    errors?: unknown,
    code: string = 'APPLICATION_ERROR',
  ) {
    super(message, category, code);
    this.errors = errors;
  }

  static badRequest(
    message: string,
    errors?: unknown,
    code?: string,
  ): AppError {
    return new AppError(DomainErrorCategory.VALIDATION, message, errors, code);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(DomainErrorCategory.AUTHENTICATION, message);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(DomainErrorCategory.AUTHORIZATION, message);
  }

  static notFound(message: string = 'Not Found'): AppError {
    return new AppError(DomainErrorCategory.NOT_FOUND, message);
  }

  static conflict(message: string, errors?: unknown): AppError {
    return new AppError(DomainErrorCategory.CONFLICT, message, errors);
  }

  static internalServerError(
    message: string = 'Internal Server Error',
  ): AppError {
    return new AppError(DomainErrorCategory.INTERNAL, message);
  }

  static tooManyRequests(message: string = 'Too Many Requests'): AppError {
    return new AppError(DomainErrorCategory.RATE_LIMIT, message);
  }

  static serviceUnavailable(message: string = 'Service Unavailable'): AppError {
    return new AppError(DomainErrorCategory.SERVICE_UNAVAILABLE, message);
  }
}

export default AppError;
