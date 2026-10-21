import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import {
  api,
  connect,
  once,
  register,
  signIn,
  startApp,
  TestApp,
} from './helpers';

/** Cookie sessions and the AuthProvider seam (docs/huginn/architecture.md §2.3). */
describe('sessions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.close());

  it('signs in with an httpOnly cookie and never hands the app a token', async () => {
    await register(t.base, 'cora.auth');
    const { response, setCookie, cookie, me } = await signIn(
      t.base,
      'coraauth@e2e.test',
    );
    expect(response.status).toBe(200);
    expect(setCookie).toMatch(/^huginn_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(JSON.stringify(me)).not.toContain(cookie.split('=')[1]);
    expect(me.email).toBe('coraauth@e2e.test');

    const session = await api(t.base, cookie, '/auth/session');
    expect(session.status).toBe(200);
    expect((await session.json()).Id).toBe(me.Id);
  });

  it('stores only a hash of the session token', async () => {
    const { cookie, me } = await signIn(t.base, 'coraauth@e2e.test');
    const token = decodeURIComponent(cookie.split('=')[1]);
    const rows: { tokenHash: string }[] = await t.app
      .get(DataSource)
      .query('SELECT "tokenHash" FROM "session" WHERE "userId" = $1', [me.Id]);
    const hashes = rows.map((r) => r.tokenHash);
    expect(hashes).toContain(createHash('sha256').update(token).digest('hex'));
    expect(hashes).not.toContain(token);
  });

  it('gives one answer for a wrong password and an unknown email', async () => {
    const wrong = await signIn(t.base, 'coraauth@e2e.test', 'Wrong#123');
    const unknown = await signIn(t.base, 'nobody@e2e.test');
    expect(wrong.response.status).toBe(401);
    expect(unknown.response.status).toBe(401);
    expect(wrong.setCookie).toBe('');
    expect((wrong.me as any).message).toBe((unknown.me as any).message);
  });

  it('refuses requests without a valid session', async () => {
    expect((await fetch(`${t.base}/api/auth/session`)).status).toBe(401);
    expect(
      (await api(t.base, 'huginn_session=forged', '/users/me')).status,
    ).toBe(401);
  });

  it('signing out ends the session over HTTP and disconnects its sockets', async () => {
    const account = await register(t.base, 'dax.auth');
    const other = await signIn(t.base, 'daxauth@e2e.test'); // a second browser
    const tab = await connect(t.base, account);
    const otherTab = await connect(t.base, {
      ...account,
      cookie: other.cookie,
    });

    const ended = once(tab.socket, 'unauthorized');
    const out = await api(t.base, account.cookie, '/auth/logout', {
      method: 'POST',
    });
    expect(out.status).toBe(204);
    expect(out.headers.getSetCookie()[0]).toMatch(/huginn_session=;/);
    expect((await ended).message).toBe('You signed out.');
    await new Promise((r) => setTimeout(r, 200));
    expect(tab.socket.connected).toBe(false);

    expect((await api(t.base, account.cookie, '/users/me')).status).toBe(401);
    // Only that browser signed out.
    expect(otherTab.socket.connected).toBe(true);
    expect((await api(t.base, other.cookie, '/users/me')).status).toBe(200);
    otherTab.socket.disconnect();

    // Signing out twice, or with no session, is fine.
    expect(
      (await api(t.base, account.cookie, '/auth/logout', { method: 'POST' }))
        .status,
    ).toBe(204);
  });

  it('refuses changes and sockets from another site', async () => {
    const account = await register(t.base, 'eli.auth');
    const foreign = { origin: 'https://evil.example' };
    const login = await fetch(`${t.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...foreign },
      body: JSON.stringify({
        email: 'eliauth@e2e.test',
        password: 'Secret#123',
      }),
    });
    expect(login.status).toBe(403);
    const patch = await api(t.base, account.cookie, '/users/me', {
      method: 'PATCH',
      headers: foreign,
      body: JSON.stringify({ bio: 'hijacked' }),
    });
    expect(patch.status).toBe(403);
    const crossSite = await api(t.base, account.cookie, '/users/me', {
      method: 'PATCH',
      headers: { 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ bio: 'hijacked' }),
    });
    expect(crossSite.status).toBe(403);
    const fromApp = await api(t.base, account.cookie, '/users/me', {
      method: 'PATCH',
      headers: { origin: 'http://localhost:4200' },
      body: JSON.stringify({ bio: 'mine' }),
    });
    expect(fromApp.status).toBe(200);

    const { io } = await import('socket.io-client');
    const socket = io(t.base, {
      extraHeaders: { cookie: account.cookie, ...foreign },
      transports: ['websocket'],
    });
    expect((await once(socket, 'unauthorized')).message).toContain('Sign in');
    socket.disconnect();
  });

  it('ends a session that has expired', async () => {
    const account = await register(t.base, 'fen.auth');
    await t.app
      .get(DataSource)
      .query(
        `UPDATE "session" SET "expiresAt" = now() - interval '1 second' WHERE "userId" = $1`,
        [account.id],
      );
    expect((await api(t.base, account.cookie, '/users/me')).status).toBe(401);
  });
});
