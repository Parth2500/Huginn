import {
  ConflictException,
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, LessThan, Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import {
  normalizeUsername,
  usernameKey,
  usernameProblem,
} from 'src/user/username.policy';
import { ExternalIdentity } from './auth-provider';
import { PendingSignup } from './pending-signup.entity';
import { UserIdentity } from './user-identity.entity';

/** Time to choose a username after signing in at Heimdall. */
export const SIGNUP_TTL_MS = 30 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export type LinkResult = 'linked' | 'already-linked' | 'taken';

/**
 * Turns an identity from a provider into a Huginn account (docs/huginn/architecture.md §2.2).
 *
 * Accounts are never matched by email: Heimdall doesn't verify emails, so matching would let
 * anyone with someone's address into their chats. A known `(issuer, subject)` signs in; an
 * unknown one starts a new account; linking is done by a signed-in person, proving both.
 */
@Injectable()
export class IdentitiesService implements OnModuleInit, OnModuleDestroy {
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @InjectRepository(UserIdentity)
    private readonly identities: Repository<UserIdentity>,
    @InjectRepository(PendingSignup)
    private readonly signups: Repository<PendingSignup>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.pruneTimer = setInterval(
      () =>
        void this.signups
          .delete({ expiresAt: LessThan(new Date()) })
          .catch(() => {}),
      PRUNE_EVERY_MS,
    );
    this.pruneTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.pruneTimer);
  }

  async userFor(identity: ExternalIdentity): Promise<number | null> {
    const found = await this.identities.findOne({
      where: { issuer: identity.issuer, subject: identity.subject },
    });
    return found?.userId ?? null;
  }

  /** Starts a new account for this identity. The returned token goes in a cookie. */
  async startSignup(identity: ExternalIdentity): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.signups.save(
      this.signups.create({
        tokenHash: hashToken(token),
        issuer: identity.issuer,
        subject: identity.subject,
        email: identity.email,
        expiresAt: new Date(Date.now() + SIGNUP_TTL_MS),
      }),
    );
    return token;
  }

  async pendingSignup(
    token: string | undefined,
  ): Promise<PendingSignup | null> {
    if (!token) {
      return null;
    }
    const pending = await this.signups.findOne({
      where: { tokenHash: hashToken(token) },
    });
    return pending && pending.expiresAt > new Date() ? pending : null;
  }

  /**
   * Creates the account, with no email or password, and links the identity, in one
   * transaction. Returns the new user's id.
   */
  async completeSignup(
    token: string | undefined,
    choice: { username: string; displayName?: string },
  ): Promise<number> {
    const pending = await this.pendingSignup(token);
    if (!pending) {
      throw new BadRequestException(
        'That sign-up has expired. Continue with Heimdall again.',
      );
    }
    const username = normalizeUsername(choice.username ?? '');
    const problem = usernameProblem(username);
    if (problem) {
      throw new BadRequestException(problem);
    }
    const displayName =
      choice.displayName?.normalize('NFKC').trim().replace(/\s+/g, ' ') || null;

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Deleting the ticket first makes a double submit fail instead of making two accounts.
        const removed = await manager.delete(PendingSignup, { id: pending.id });
        if (!removed.affected) {
          throw new BadRequestException(
            'That sign-up has already been used. Sign in again.',
          );
        }
        const user = await manager.save(
          manager.create(User, {
            username,
            usernameKey: usernameKey(username),
            displayName,
            email: null,
            password: null,
          }),
        );
        await manager.insert(UserIdentity, {
          userId: user.Id,
          issuer: pending.issuer,
          subject: pending.subject,
          email: pending.email,
        });
        return user.Id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'user')) {
        throw new ConflictException('That username is taken. Try another one.');
      }
      if (isUniqueViolation(error, 'user_identity')) {
        throw new ConflictException(
          'That Heimdall account already has a Huginn account. Sign in again.',
        );
      }
      throw error;
    }
  }

  async link(userId: number, identity: ExternalIdentity): Promise<LinkResult> {
    const owner = await this.userFor(identity);
    if (owner !== null) {
      return owner === userId ? 'already-linked' : 'taken';
    }
    try {
      await this.identities.insert({ userId, ...identity });
      return 'linked';
    } catch (error) {
      // Either this account already has another Heimdall identity, or someone linked it just now.
      if (isUniqueViolation(error, 'user_identity')) {
        return 'taken';
      }
      throw error;
    }
  }

  /** How this person can sign in, for their profile. */
  async methods(userId: number, issuer: string | null) {
    const [user, identity] = await Promise.all([
      this.dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .select('user.Id')
        .addSelect('user.password IS NOT NULL', 'hasPassword')
        .where('user.Id = :userId', { userId })
        .getRawOne<{ hasPassword: boolean }>(),
      issuer ? this.identities.findOne({ where: { userId, issuer } }) : null,
    ]);
    return {
      password: !!user?.hasPassword,
      heimdall: identity
        ? { linked: true, email: identity.email }
        : { linked: false, email: null },
    };
  }

  /** Unlinking is allowed only while a password remains, so nobody locks themselves out. */
  async unlink(userId: number, issuer: string) {
    const { password } = await this.methods(userId, null);
    if (!password) {
      throw new BadRequestException(
        'Heimdall is the only way you sign in, so it stays linked.',
      );
    }
    await this.identities.delete({ userId, issuer });
  }
}

function isUniqueViolation(error: unknown, table: string): boolean {
  const driver = (error as { driverError?: { code?: string; table?: string } })
    ?.driverError;
  return driver?.code === '23505' && driver.table === table;
}
