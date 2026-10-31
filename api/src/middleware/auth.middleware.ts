import { Injectable, NestMiddleware } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Session } from 'src/auth/session.entity';
import {
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from 'src/auth/session-cookie';
import { SessionsService } from 'src/auth/sessions.service';
import { IUser } from 'src/user/entities/user.interface';

export interface RequestModel extends Request {
  user: IUser;
  session: Session;
}

/** Signs each request in from the session cookie. */
@Injectable()
export class AuthMiddleWare implements NestMiddleware {
  constructor(private readonly sessions: SessionsService) {}

  async use(req: RequestModel, res: Response, next: (error?: any) => void) {
    const resolved = await this.sessions.resolve(
      readSessionToken(req.headers.cookie),
    );
    if (!resolved) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    if (resolved.extended) {
      res.cookie(
        sessionCookieName(),
        readSessionToken(req.headers.cookie),
        sessionCookieOptions(),
      );
    }
    req.user = resolved.user;
    req.session = resolved.session;
    next();
  }
}
