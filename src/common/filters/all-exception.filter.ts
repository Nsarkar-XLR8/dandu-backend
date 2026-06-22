import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import {
  DomainErrorCategory,
  DomainException,
} from '../domain/exceptions/domain.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Ignore favicon requests - this is normal browser behavior
    if (request.url === '/favicon.ico') {
      response.status(204).end();
      return;
    }

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let error = 'Error';

    // Check if exception has a status property
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'status' in exception &&
      typeof exception.status === 'number'
    ) {
      statusCode = exception.status;
    }

    if (exception instanceof DomainException) {
      statusCode = this.mapDomainErrorToHttpStatus(exception.category);
      message = exception.message;
      error = exception.code;
    }

    // Handle NestJS HttpException
    else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') message = res;
      else if (typeof res === 'object' && res['message']) {
        const resMessage = res['message'] as string | string[];
        message = Array.isArray(resMessage)
          ? resMessage.join(', ')
          : String(resMessage);
      }
      error = exception.name;
    }

    // Generic JS Error
    else if (exception instanceof Error) {
      // statusCode = exception.;
      message = exception.message;
      error = exception.name;
    }

    const logPayload = {
      context: 'AllExceptionsFilter',
      statusCode,
      path: request.url,
      method: request.method,
      exception:
        exception instanceof Error ? exception.message : String(exception),
      stack:
        statusCode >= HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error
          ? exception.stack
          : undefined,
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error('Unhandled server exception caught', logPayload);
    } else if (statusCode === HttpStatus.NOT_FOUND) {
      this.logger.info('Request route not found', logPayload);
    } else {
      this.logger.warn('Handled request exception', logPayload);
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      stack:
        process.env.NODE_ENV === 'development' && exception instanceof Error
          ? exception.stack
          : null,
    });
  }

  private mapDomainErrorToHttpStatus(category: DomainErrorCategory): number {
    switch (category) {
      case DomainErrorCategory.VALIDATION:
        return HttpStatus.BAD_REQUEST;
      case DomainErrorCategory.AUTHENTICATION:
        return HttpStatus.UNAUTHORIZED;
      case DomainErrorCategory.AUTHORIZATION:
        return HttpStatus.FORBIDDEN;
      case DomainErrorCategory.NOT_FOUND:
        return HttpStatus.NOT_FOUND;
      case DomainErrorCategory.CONFLICT:
        return HttpStatus.CONFLICT;
      case DomainErrorCategory.RATE_LIMIT:
        return HttpStatus.TOO_MANY_REQUESTS;
      case DomainErrorCategory.SERVICE_UNAVAILABLE:
        return HttpStatus.SERVICE_UNAVAILABLE;
      case DomainErrorCategory.INTERNAL:
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
