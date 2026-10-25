import {
  type JWTPayload,
  type JWTVerifyGetKey,
  customFetch,
  createRemoteJWKSet,
  jwtVerify,
} from 'jose';

/** The event that marks a Back-Channel Logout 1.0 token (section 2.4). */
export const BACKCHANNEL_LOGOUT_EVENT =
  'http://schemas.openid.net/event/backchannel-logout';

/** What a valid logout token names: the person and Heimdall's session. */
export interface LogoutClaims {
  subject: string | null;
  sid: string;
}

export class LogoutTokenError extends Error {}

/**
 * Checks a `logout_token` from Heimdall (Back-Channel Logout 1.0, section 2.6). A token that
 * passes ends every Huginn session that Heimdall's session `sid` started.
 *
 * - The signature, `alg` RS256, and `typ` logout+jwt, with a key from Heimdall's JWKS.
 * - `iss` is Heimdall, `aud` is Huginn, `iat` is recent, and `exp` has not passed.
 * - `events` holds the back-channel logout event, and there is no `nonce`, so an ID token can't
 *   pass as a logout token.
 * - A `sid` is required: Huginn ends sessions by `sid`, never every session of a person.
 * - Each `jti` works once, until its token expires.
 */
export class LogoutTokenVerifier {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly keys: JWTVerifyGetKey,
    private readonly now: () => number = Date.now,
  ) {}

  static forIssuer(
    issuer: string,
    clientId: string,
    jwksUri: URL,
    fetchImpl?: typeof fetch,
  ): LogoutTokenVerifier {
    const keys = createRemoteJWKSet(
      jwksUri,
      fetchImpl ? { [customFetch]: fetchImpl } : undefined,
    );
    return new LogoutTokenVerifier(issuer, clientId, keys);
  }

  async verify(token: unknown): Promise<LogoutClaims> {
    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 8192
    ) {
      throw new LogoutTokenError('logout_token missing');
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: this.clientId,
        algorithms: ['RS256'],
        typ: 'logout+jwt',
        maxTokenAge: '2 minutes',
        clockTolerance: 30,
        requiredClaims: ['iat', 'exp', 'jti'],
        currentDate: new Date(this.now()),
      }));
    } catch {
      throw new LogoutTokenError('logout_token not valid');
    }

    const events = payload['events'];
    if (
      typeof events !== 'object' ||
      events === null ||
      typeof (events as Record<string, unknown>)[BACKCHANNEL_LOGOUT_EVENT] !==
        'object'
    ) {
      throw new LogoutTokenError('logout_token has no logout event');
    }
    if ('nonce' in payload) {
      throw new LogoutTokenError('logout_token has a nonce');
    }
    const sid = payload['sid'];
    if (typeof sid !== 'string' || sid.length === 0) {
      throw new LogoutTokenError('logout_token has no sid');
    }

    this.forgetExpired();
    const jti = payload.jti;
    if (this.seen.has(jti)) {
      throw new LogoutTokenError('logout_token replayed');
    }
    this.seen.set(jti, (payload.exp + 30) * 1000);

    return {
      subject: typeof payload.sub === 'string' ? payload.sub : null,
      sid,
    };
  }

  private forgetExpired() {
    const now = this.now();
    for (const [jti, until] of this.seen) {
      if (until <= now) {
        this.seen.delete(jti);
      }
    }
  }
}
