import { HeimdallOidcProvider } from '../src/auth/heimdall-oidc.provider';
import { ExternalIdentity, SignInError } from '../src/auth/auth-provider';
import { api, register, startApp, TestApp } from './helpers';

const ISSUER = 'https://acme.heimdall.test';

/**
 * Stands in for Heimdall. The "code" in the callback names the identity Heimdall would confirm,
 * so every account rule can be tested without a real identity provider. openid-client's checks
 * (state, PKCE, iss, the ID token) are its own and are exercised against the real Heimdall.
 */
const fakeHeimdall = {
  name: 'heimdall',
  enabled: true,
  signIn: () =>
    Promise.resolve({
      kind: 'redirect' as const,
      url: `${ISSUER}/oauth/v1/authorize?state=s`,
      transaction: 'tx',
    }),
  completeSignIn: (callback: URL, transaction: string) => {
    const code = callback.searchParams.get('code') ?? '';
    if (transaction !== 'tx' || !code) {
      return Promise.reject(new SignInError('refused'));
    }
    const [subject, email] = code.split('|');
    return Promise.resolve<ExternalIdentity>({
      issuer: ISSUER,
      subject,
      email: email ?? null,
    });
  },
};

/** Sign-in through Heimdall, first-time sign-up, and linking (docs/huginn/architecture.md §2.2). */
describe('Heimdall sign-in', () => {
  let t: TestApp;

  beforeAll(async () => {
    Object.assign(process.env, {
      HEIMDALL_ISSUER: ISSUER,
      HEIMDALL_CLIENT_ID: 'huginn',
      HEIMDALL_CLIENT_SECRET: 'unused-by-the-fake',
      HEIMDALL_REDIRECT_URI: 'http://localhost:4200/api/auth/heimdall/callback',
    });
    t = await startApp((b) =>
      b.overrideProvider(HeimdallOidcProvider).useValue(fakeHeimdall),
    );
  });
  afterAll(() => t.close());

  /** A browser's cookie jar, enough for these redirects. */
  class Browser {
    jar = new Map<string, string>();
    get cookie() {
      return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    async go(path: string, init: RequestInit = {}) {
      const response = await fetch(`${t.base}/api${path}`, {
        ...init,
        redirect: 'manual',
        headers: {
          cookie: this.cookie,
          'content-type': 'application/json',
          ...init.headers,
        },
      });
      for (const set of response.headers.getSetCookie()) {
        const [pair] = set.split(';');
        const [name, value] = [
          pair.slice(0, pair.indexOf('=')),
          pair.slice(pair.indexOf('=') + 1),
        ];
        if (value) {
          this.jar.set(name, value);
        } else {
          this.jar.delete(name);
        }
      }
      return response;
    }
    /** Start, then come back from Heimdall as `subject`. Returns where the app is sent. */
    async heimdall(subject: string, intent = '') {
      const start = await this.go(`/auth/heimdall/start${intent}`);
      expect(start.status).toBe(303);
      const back = await this.go(
        `/auth/heimdall/callback?code=${encodeURIComponent(subject)}&state=s&iss=${ISSUER}`,
      );
      return back.headers.get('location');
    }
  }

  it('offers Heimdall on the sign-in page', async () => {
    const res = await fetch(`${t.base}/api/auth/providers`);
    expect(await res.json()).toEqual({ password: true, heimdall: true });
  });

  it('sends a new person to choose a username, then signs them in', async () => {
    const b = new Browser();
    const start = await b.go('/auth/heimdall/start');
    expect(start.headers.get('location')).toContain(ISSUER);
    expect(b.jar.has('huginn_oidc')).toBe(true);

    const back = await b.go(
      '/auth/heimdall/callback?code=' +
        encodeURIComponent('sub-ana|ana@acme.test'),
    );
    expect(back.headers.get('location')).toBe('/public/welcome');
    expect(b.jar.has('huginn_oidc')).toBe(false);
    expect(b.jar.has('huginn_session')).toBe(false);

    const pending = await b.go('/auth/signup');
    expect(await pending.json()).toMatchObject({ email: 'ana@acme.test' });

    const reserved = await b.go('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'ad.min' }),
    });
    expect(reserved.status).toBe(400);

    const done = await b.go('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username: 'ana.h', displayName: 'Ana' }),
    });
    expect(done.status).toBe(201);
    const me = await done.json();
    expect(me).toMatchObject({ username: 'ana.h', displayName: 'Ana' });
    // Heimdall's email is unverified, so it isn't the account's email.
    expect(me.email ?? null).toBeNull();
    expect(b.jar.has('huginn_session')).toBe(true);
    expect(b.jar.has('huginn_signup')).toBe(false);

    // The ticket is single-use.
    b.jar.set('huginn_signup', 'reused');
    expect(
      (
        await b.go('/auth/signup', {
          method: 'POST',
          body: '{"username":"ana.two"}',
        })
      ).status,
    ).toBe(400);
  });

  it('signs a returning person straight in', async () => {
    const b = new Browser();
    expect(await b.heimdall('sub-ana|ana@acme.test')).toBe(
      '/private/dashboard',
    );
    const me = await (await b.go('/auth/session')).json();
    expect(me.username).toBe('ana.h');
    const methods = await (await b.go('/auth/methods')).json();
    expect(methods).toEqual({
      password: false,
      heimdall: { linked: true, email: 'ana@acme.test', available: true },
    });
    // Heimdall is ana's only way in, so it can't be unlinked.
    expect(
      (await b.go('/auth/heimdall/link', { method: 'DELETE' })).status,
    ).toBe(400);
  });

  it('never matches accounts by email', async () => {
    const owner = await register(t.base, 'bo.mail'); // bomail@e2e.test
    const b = new Browser();
    // Someone at Heimdall claims bo's email: they get a new account, not bo's.
    expect(await b.heimdall('sub-intruder|bomail@e2e.test')).toBe(
      '/public/welcome',
    );
    const methods = await (
      await api(t.base, owner.cookie, '/auth/methods')
    ).json();
    expect(methods.heimdall.linked).toBe(false);
  });

  it('links Heimdall to a signed-in account, once', async () => {
    const cy = await register(t.base, 'cy.link');
    const b = new Browser();
    b.jar.set('huginn_session', cy.cookie.split('=')[1]);

    expect(await b.heimdall('sub-cy', '?intent=link')).toBe(
      '/private/profile?heimdall=linked',
    );
    expect(await b.heimdall('sub-cy', '?intent=link')).toBe(
      '/private/profile?heimdall=already-linked',
    );
    // An identity that belongs to someone else can't be taken over.
    expect(await b.heimdall('sub-ana', '?intent=link')).toBe(
      '/private/profile?heimdall=taken',
    );

    // Now cy can sign in either way...
    const viaHeimdall = new Browser();
    expect(await viaHeimdall.heimdall('sub-cy')).toBe('/private/dashboard');
    expect(
      (await (await viaHeimdall.go('/auth/session')).json()).username,
    ).toBe('cy.link');

    // ...and, with a password left, may unlink.
    expect(
      (await b.go('/auth/heimdall/link', { method: 'DELETE' })).status,
    ).toBe(204);
    expect(await new Browser().heimdall('sub-cy')).toBe('/public/welcome');
  });

  it('linking needs a session, and refused or cancelled sign-ins say so', async () => {
    const b = new Browser();
    expect(
      (await b.go('/auth/heimdall/start?intent=link')).headers.get('location'),
    ).toBe('/public/login');
    await b.go('/auth/heimdall/start');
    expect(
      (await b.go('/auth/heimdall/callback?error=access_denied')).headers.get(
        'location',
      ),
    ).toBe('/public/login?heimdall=cancelled');
    // No transaction cookie (a forged or replayed callback): refused.
    expect(
      (
        await new Browser().go('/auth/heimdall/callback?code=sub-ana')
      ).headers.get('location'),
    ).toBe('/public/login?heimdall=failed');
  });
});
