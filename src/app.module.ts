import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JobModule } from './job/job.module';
import { RedisModule } from './common/modules/redis.module';
import { PrismaModule } from './common/modules/prisma.module';
import { RateLimitModule } from './common/modules/rate-limit.module';
import { MetricsModule } from './metrics/metrics.module';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/config/winston.config';
import { LoggerModule } from './common/modules/logger.module';

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
    // Redis module (global - can be injected anywhere)
    RedisModule,
    // Prisma module (global - single database client for all adapters)
    PrismaModule,
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
export class AppModule {}
