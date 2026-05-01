import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestMetadata {
  ip: string;
  userAgent: string;
  device?: string;
  requestId?: string;
}

const firstHeaderValue = (
  value: Request['headers'][string],
): string | undefined => (Array.isArray(value) ? value[0] : value);

export const RequestMeta = createParamDecorator(
  (includeDevice: boolean = true, ctx: ExecutionContext): RequestMetadata => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const meta: RequestMetadata = {
      ip: req.ip || 'unknown',
      userAgent: firstHeaderValue(req.headers['user-agent']) || 'unknown',
      requestId: firstHeaderValue(req.headers['x-request-id']),
    };

    if (includeDevice) {
      meta.device =
        firstHeaderValue(req.headers['x-device']) ||
        firstHeaderValue(req.headers['x-device-id']) ||
        firstHeaderValue(req.headers['sec-ch-ua-platform']);
    }

    return meta;
  },
);
