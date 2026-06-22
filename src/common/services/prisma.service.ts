import 'dotenv/config';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CustomLoggerService } from './custom-logger.service';

/**
 * PrismaService — MySQL-compatible Prisma Client wrapper.
 *
 * Prisma 7 Breaking Change:
 * - `url` is removed from the schema's datasource block.
 * - For CLI tools (generate, db push): URL is read from prisma.config.ts
 * - For runtime: URL is passed via `datasourceUrl` in the PrismaClient constructor.
 *
 * MySQL-specific notes:
 * - The connection URL is provided through DATABASE_URL.
 * - Prisma manages the database connection pool.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly customLogger: CustomLoggerService) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required to initialize Prisma.');
    }

    const enableQueryLogs = process.env.PRISMA_QUERY_LOGS === 'true';

    super({
      datasourceUrl: databaseUrl,
      log: enableQueryLogs ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    this.customLogger.log('Connecting to MySQL...', 'PrismaService');
    await this.$connect();
    this.customLogger.log('MySQL connected successfully', 'PrismaService');
  }

  async onModuleDestroy() {
    this.customLogger.log('Disconnecting from MySQL...', 'PrismaService');
    await this.$disconnect();
    this.customLogger.log('MySQL disconnected', 'PrismaService');
  }
}
