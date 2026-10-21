import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Subject } from 'rxjs';
import { LessThan, Repository } from 'typeorm';
import { IUser } from 'src/user/entities/user.interface';
import {
  IUserService,
  UserToken,
} from 'src/user/services/iservices/user.service.interface';
import { Session } from './session.entity';

/** A session ends after this long without use... */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
/** ...and after this long regardless, so a stolen cookie can't be kept alive forever. */
export const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;
/** Use is recorded at most this often, so ordinary traffic doesn't write on every request. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export interface ResolvedSession {
  session: Session;
  user: IUser;
  /** The expiry moved forward, so the cookie should be sent again with the new lifetime. */
  extended: boolean;
}

/** Server-side sessions behind the cookie. Providers prove who someone is; this keeps them signed in. */
@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  /** Ids of sessions that just ended, so the chat gateway can disconnect their sockets. */
  readonly ended = new Subject<string>();
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    @Inject(UserToken) private readonly userService: IUserService,
  ) {}

  onModuleInit() {
    this.pruneTimer = setInterval(
      () => void this.prune().catch(() => {}),
      PRUNE_EVERY_MS,
    );
    this.pruneTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.pruneTimer);
  }

  async create(
    userId: number,
    provider: string,
    details: { userAgent?: string; providerData?: unknown } = {},
  ): Promise<{ token: string; session: Session }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const session = await this.sessions.save(
      this.sessions.create({
        tokenHash: hashToken(token),
        userId,
        provider,
        providerData: details.providerData ?? null,
        userAgent: details.userAgent?.slice(0, 200) ?? null,
        lastUsedAt: now,
        expiresAt: this.expiry(now, now),
      }),
    );
    return { token, session };
  }

  /** The session and person behind a cookie token, or null if it's unknown or has expired. */
  async resolve(
    token: string | undefined,
    now = new Date(),
  ): Promise<ResolvedSession | null> {
    if (!token) {
      return null;
    }
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(token) },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt <= now) {
      await this.sessions.delete(session.id);
      return null;
    }
    const user = await this.userService.findByIdPromise(session.userId);
    if (!user) {
      return null;
    }
    let extended = false;
    if (now.getTime() - session.lastUsedAt.getTime() >= TOUCH_EVERY_MS) {
      session.lastUsedAt = now;
      session.expiresAt = this.expiry(session.createdAt, now);
      await this.sessions.update(session.id, {
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
      });
      extended = true;
    }
    return { session, user, extended };
  }

  async revoke(session: Session) {
    await this.sessions.delete(session.id);
    this.ended.next(session.id);
  }

  async prune(now = new Date()): Promise<number> {
    const result = await this.sessions.delete({ expiresAt: LessThan(now) });
    return result.affected ?? 0;
  }

  private expiry(createdAt: Date, now: Date) {
    return new Date(
      Math.min(
        now.getTime() + SESSION_IDLE_MS,
        createdAt.getTime() + SESSION_MAX_MS,
      ),
    );
  }
}
