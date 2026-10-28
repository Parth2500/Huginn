import { generateKeyPairSync } from 'crypto';
import { calculateJwkThumbprint, decodeProtectedHeader, SignJWT } from 'jose';
import { ClientKeyError, loadClientKey } from './client-key';
import { heimdallSettings } from './heimdall-oidc.provider';

const pem = (
  type: Parameters<typeof generateKeyPairSync>[0],
  options: object,
) =>
  generateKeyPairSync(
    type as 'ec',
    options as { namedCurve: string },
  ).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

describe('client key', () => {
  it('loads an EC P-256 key as ES256, with its thumbprint as kid', async () => {
    const key = await loadClientKey(pem('ec', { namedCurve: 'P-256' }));
    expect(key.alg).toBe('ES256');
    const [jwk] = key.publicJwks.keys;
    expect(key.kid).toBe(
      await calculateJwkThumbprint({
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
      }),
    );
    expect(jwk).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      kid: key.kid,
      alg: 'ES256',
    });

    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: key.alg, kid: key.kid })
      .sign(key.key);
    expect(decodeProtectedHeader(jwt).kid).toBe(key.kid);
  });

  it('never puts a private member in the public key set', async () => {
    const ec = await loadClientKey(pem('ec', { namedCurve: 'P-256' }));
    const rsa = await loadClientKey(pem('rsa', { modulusLength: 2048 }));
    for (const jwk of [...ec.publicJwks.keys, ...rsa.publicJwks.keys]) {
      for (const member of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
        expect(jwk).not.toHaveProperty(member);
      }
    }
    expect(rsa.alg).toBe('RS256');
  });

  it('refuses keys Heimdall does not accept', async () => {
    await expect(
      loadClientKey(pem('ec', { namedCurve: 'P-384' })),
    ).rejects.toThrow(ClientKeyError);
    await expect(
      loadClientKey(pem('rsa', { modulusLength: 1024 })),
    ).rejects.toThrow(ClientKeyError);
    await expect(
      loadClientKey(pem('rsa-pss', { modulusLength: 2048 })),
    ).rejects.toThrow(ClientKeyError);
    await expect(loadClientKey(pem('ed25519', {}))).rejects.toThrow(
      ClientKeyError,
    );
    await expect(loadClientKey('not a key')).rejects.toThrow(ClientKeyError);
  });
});

describe('Heimdall settings', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.HEIMDALL_ISSUER = 'https://acme.example.com';
    process.env.HEIMDALL_CLIENT_ID = 'huginn';
    process.env.HEIMDALL_REDIRECT_URI = 'https://huginn.example.com/cb';
    delete process.env.HEIMDALL_CLIENT_SECRET;
    delete process.env.HEIMDALL_CLIENT_KEY_FILE;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('needs a client secret or a client key', () => {
    expect(heimdallSettings()).toBeNull();
    process.env.HEIMDALL_CLIENT_SECRET = 'secret';
    expect(heimdallSettings()).toMatchObject({ clientKeyFile: null });
    delete process.env.HEIMDALL_CLIENT_SECRET;
    process.env.HEIMDALL_CLIENT_KEY_FILE = '.local/heimdall-client-key.pem';
    expect(heimdallSettings()).toMatchObject({
      clientKeyFile: '.local/heimdall-client-key.pem',
      clientSecret: null,
    });
  });
});
