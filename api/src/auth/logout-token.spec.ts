import {
  type CryptoKey,
  type JWTPayload,
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BACKCHANNEL_LOGOUT_EVENT,
  LogoutTokenError,
  LogoutTokenVerifier,
} from './logout-token';

const ISSUER = 'https://acme.localhost:7200';
const CLIENT = 'huginn';
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const SECONDS = Math.floor(NOW / 1000);

let key: CryptoKey;
let otherKey: CryptoKey;
let verifier: () => LogoutTokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  verifier = () => new LogoutTokenVerifier(ISSUER, CLIENT, keys, () => NOW);
});

function claims(overrides: JWTPayload = {}): JWTPayload {
  return {
    iss: ISSUER,
    aud: CLIENT,
    sub: 'user-1',
    iat: SECONDS,
    exp: SECONDS + 120,
    jti: 'jti-1',
    sid: 'Qm9vazEyMzQ1Njc4OTAxMg',
    events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
    ...overrides,
  };
}

function sign(
  payload: JWTPayload,
  options: { typ?: string; signer?: CryptoKey } = {},
) {
  return new SignJWT(payload)
    .setProtectedHeader({
      alg: 'RS256',
      kid: 'k1',
      typ: options.typ ?? 'logout+jwt',
    })
    .sign(options.signer ?? key);
}

describe('LogoutTokenVerifier', () => {
  it('returns the sub and the sid of a valid token', async () => {
    expect(await verifier().verify(await sign(claims()))).toEqual({
      subject: 'user-1',
      sid: 'Qm9vazEyMzQ1Njc4OTAxMg',
    });
  });

  it('accepts each jti once', async () => {
    const v = verifier();
    const token = await sign(claims());
    await v.verify(token);

    await expect(v.verify(token)).rejects.toThrow(LogoutTokenError);
    await expect(
      v.verify(await sign(claims({ jti: 'jti-2' }))),
    ).resolves.toBeTruthy();
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['another audience', { aud: 'other-app' }],
    ['an expired token', { iat: SECONDS - 600, exp: SECONDS - 480 }],
    ['an old iat', { iat: SECONDS - 600 }],
    ['no logout event', { events: { 'http://example.com/other': {} } }],
    ['no events', { events: undefined }],
    ['a nonce, as an ID token has', { nonce: 'n-1' }],
    ['no sid', { sid: undefined }],
    ['an empty sid', { sid: '' }],
    ['no jti', { jti: undefined }],
  ])('refuses %s', async (_name, overrides) => {
    await expect(
      verifier().verify(await sign(claims(overrides as JWTPayload))),
    ).rejects.toThrow(LogoutTokenError);
  });

  it('refuses an ID token type', async () => {
    await expect(
      verifier().verify(await sign(claims(), { typ: 'JWT' })),
    ).rejects.toThrow(LogoutTokenError);
  });

  it('refuses a token that another key signed', async () => {
    await expect(
      verifier().verify(await sign(claims(), { signer: otherKey })),
    ).rejects.toThrow(LogoutTokenError);
  });

  it.each([undefined, '', 42, 'not.a.jwt', 'x'.repeat(9000)])(
    'refuses %s',
    async (token) => {
      await expect(verifier().verify(token)).rejects.toThrow(LogoutTokenError);
    },
  );
});
