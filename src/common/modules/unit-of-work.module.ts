import { Global, Module } from '@nestjs/common';
import { UNIT_OF_WORK_TOKEN } from '../domain/interfaces/unit-of-work.interface';
import { PrismaUnitOfWork } from '../infrastructure/persistence/prisma-unit-of-work';
import { PrismaModule } from './prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    PrismaUnitOfWork,
    { provide: UNIT_OF_WORK_TOKEN, useExisting: PrismaUnitOfWork },
  ],
  exports: [UNIT_OF_WORK_TOKEN],
})
export class UnitOfWorkModule {}
