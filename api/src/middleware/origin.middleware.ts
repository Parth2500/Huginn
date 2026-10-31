import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isForeignOrigin } from 'src/auth/session-cookie';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Refuses changes that a browser says come from another site (cross-site request forgery). */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: (error?: any) => void) {
    if (!SAFE_METHODS.has(req.method) && isForeignOrigin(req.headers)) {
      throw new ForbiddenException('This request came from another site.');
    }
    next();
  }
}
