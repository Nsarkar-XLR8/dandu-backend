import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Health check endpoint' })
  @SkipThrottle() // Skip rate limiting for health check
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({ summary: 'Liveness probe' })
  @SkipThrottle()
  @Get('health')
  health() {
    return this.appService.health();
  }

  @ApiOperation({ summary: 'Readiness probe' })
  @SkipThrottle()
  @Get('ready')
  ready() {
    return this.appService.ready();
  }
}
