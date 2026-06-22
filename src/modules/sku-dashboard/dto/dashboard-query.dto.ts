import { IsIn, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(['7D', '30D', '90D', '365D'])
  period?: '7D' | '30D' | '90D' | '365D';
}

