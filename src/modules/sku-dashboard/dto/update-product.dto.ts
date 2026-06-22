import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost?: number;

  @ApiPropertyOptional({ description: 'Product weight in oz/lbs' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weight?: number;

  @ApiPropertyOptional({ description: 'Product length in inches' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  length?: number;

  @ApiPropertyOptional({ description: 'Product width in inches' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  width?: number;

  @ApiPropertyOptional({ description: 'Product height in inches' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  height?: number;
}
