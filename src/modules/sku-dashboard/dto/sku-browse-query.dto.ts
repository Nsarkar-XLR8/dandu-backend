import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SkuBrowseQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'])
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

  @IsOptional()
  @IsIn(['ALL', 'AMAZON', 'EBAY', 'WALMART', 'SHOPIFY', 'WEBSITE', 'OTHER'])
  channel?:
    | 'ALL'
    | 'AMAZON'
    | 'EBAY'
    | 'WALMART'
    | 'SHOPIFY'
    | 'WEBSITE'
    | 'OTHER';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

