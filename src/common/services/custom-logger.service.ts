import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

import { RequestStorage } from './request-storage.service';

@Injectable()
export class CustomLoggerService implements LoggerService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  private getMetadata(context?: string) {
    const requestId = RequestStorage.getRequestId();
    return { context, requestId };
  }

  log(message: string, context?: string) {
    this.logger.info(message, this.getMetadata(context));
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { ...this.getMetadata(context), trace });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, this.getMetadata(context));
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, this.getMetadata(context));
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, this.getMetadata(context));
  }

  // Additional helper methods for structured logging
  logWithMetadata(
    level: 'info' | 'error' | 'warn' | 'debug',
    message: string,
    metadata: Record<string, any>,
  ) {
    this.logger.log(level, message, metadata);
  }

  logUserAction(userId: string, action: string, details?: Record<string, any>) {
    this.logger.info('User action', {
      context: 'UserAction',
      userId,
      action,
      ...details,
    });
  }

  logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
  ) {
    this.logger.info('API Request', {
      context: 'ApiRequest',
      method,
      path,
      statusCode,
      duration,
    });
  }

  logDatabaseQuery(
    operation: string,
    model: string,
    duration: number,
    success: boolean,
  ) {
    this.logger.info('Database query', {
      context: 'DatabaseQuery',
      operation,
      model,
      duration,
      success,
    });
  }
}
