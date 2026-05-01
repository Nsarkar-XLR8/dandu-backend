import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JobModule } from './job/job.module';
import { RedisModule } from './common/modules/redis.module';
import { PrismaModule } from './common/modules/prisma.module';
import { UnitOfWorkModule } from './common/modules/unit-of-work.module';
import { AppConfigModule } from './common/modules/app-config.module';
import { RateLimitModule } from './common/modules/rate-limit.module';
import { MetricsModule } from './metrics/metrics.module';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/config/winston.config';
import { LoggerModule } from './common/modules/logger.module';

import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';

@Module({
  imports: [
    // Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Winston logger module (global - can be injected anywhere)
    WinstonModule.forRoot(winstonConfig),
    // Custom logger module (global - can be injected anywhere)
    LoggerModule,
    // Typed application config wrapper for injectable services
    AppConfigModule,
    // Redis module (global - can be injected anywhere)
    RedisModule,
    // Prisma module (global - single database client for all adapters)
    PrismaModule,
    // Unit of Work module (global - single transactional adapter binding)
    UnitOfWorkModule,
    // Rate limiting module (global - throttles requests using Redis)
    RateLimitModule,
    // Metrics module (global - Prometheus metrics)
    MetricsModule,
    AuthModule,
    JobModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
