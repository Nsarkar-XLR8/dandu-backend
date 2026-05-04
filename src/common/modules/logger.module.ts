import { Global, Module } from '@nestjs/common';
import { LOGGER_TOKEN } from '../domain/interfaces/logger.interface';
import { CustomLoggerService } from '../services/custom-logger.service';

@Global()
@Module({
  providers: [
    CustomLoggerService,
    { provide: LOGGER_TOKEN, useExisting: CustomLoggerService },
  ],
  exports: [CustomLoggerService, LOGGER_TOKEN],
})
export class LoggerModule {}
