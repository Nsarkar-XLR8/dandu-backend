
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './common/modules/redis.module';
import { PrismaModule } from './common/modules/prisma.module';
import { UnitOfWorkModule } from './common/modules/unit-of-work.module';
import { AppConfigModule } from './common/modules/app-config.module';
import { RateLimitModule } from './common/modules/rate-limit.module';
import { MetricsModule } from './metrics/metrics.module';
import { SkuDashboardModule } from './modules/sku-dashboard/sku-dashboard.module';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/config/winston.config';
import { LoggerModule } from './common/modules/logger.module';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';

@Module({
  imports: [
    // Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
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
    SkuDashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
=======
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './common/modules/redis.module';
import { PrismaModule } from './common/modules/prisma.module';
import { UnitOfWorkModule } from './common/modules/unit-of-work.module';
import { AppConfigModule } from './common/modules/app-config.module';
import { RateLimitModule } from './common/modules/rate-limit.module';
import { MetricsModule } from './metrics/metrics.module';
import { SkuDashboardModule } from './modules/sku-dashboard/sku-dashboard.module';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/config/winston.config';
import { LoggerModule } from './common/modules/logger.module';
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
    SkuDashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

