import { api, register, startApp, TestApp } from './helpers';

describe('accounts, profiles and privacy', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.close());

  const post = (body: object) =>
    fetch(`${t.base}/api/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'Secret#123', ...body }),
    });

  it('applies the username policy at registration', async () => {
    await register(t.base, 'Rowan');
    const reserved = await post({ email: 'a@e2e.test', username: 'ad.min' });
    expect(reserved.status).toBe(400);
    expect((await reserved.json()).message).toBe('That username is reserved.');

    const taken = await post({ email: 'b@e2e.test', username: 'ROWAN' });
    expect(taken.status).toBe(409);

    const shape = await post({ email: 'c@e2e.test', username: '9lives' });
    expect(shape.status).toBe(400);
  });

  it('reports availability without signing in', async () => {
    const res = await fetch(`${t.base}/api/users/username-available?u=rowan`);
    expect(await res.json()).toEqual({
      available: false,
      reason: 'That username is taken.',
    });
    const free = await fetch(`${t.base}/api/users/username-available?u=quill`);
    expect(await free.json()).toEqual({ available: true });
  });

  it('shows email only to its owner', async () => {
    const owner = await register(t.base, 'ivy.e2e');
    const viewer = await register(t.base, 'oak.e2e');

    const me = await (await api(t.base, owner.token, '/users/me')).json();
    expect(me.email).toBe('ivye2e@e2e.test');
    expect(me.password).toBeUndefined();

    const profile = await (
      await api(t.base, viewer.token, `/users/${owner.id}/profile`)
    ).json();
    expect(profile.username).toBe('ivy.e2e');
    expect(profile.email).toBeUndefined();

    const search = await (
      await api(t.base, viewer.token, '/users/search?q=ivy')
    ).json();
    expect(search.map((u: any) => u.username)).toEqual(['ivy.e2e']);
    expect(search[0].email).toBeUndefined();
  });

  it('searches by prefix, then by "contains", and never returns the searcher', async () => {
    const me = await register(t.base, 'searcher.e2e');
    await register(t.base, 'harbor.light');
    await register(t.base, 'old.harbor');

    const prefix = await (
      await api(t.base, me.token, '/users/search?q=harb')
    ).json();
    expect(prefix.map((u: any) => u.username)).toEqual([
      'harbor.light',
      'old.harbor',
    ]);

    const self = await (
      await api(t.base, me.token, '/users/search?q=searcher')
    ).json();
    expect(self).toEqual([]);
  });

  it('lets people change only their own account', async () => {
    const a = await register(t.base, 'pine.e2e');
    const b = await register(t.base, 'fir.e2e');
    const other = await api(t.base, a.token, `/users/${b.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ username: 'hijacked' }),
    });
    expect(other.status).toBe(403);

    const mine = await api(t.base, a.token, '/users/me', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: '  Pine   Tree ',
        bio: 'Evergreen.',
      }),
    });
    const updated = await mine.json();
    expect(updated.displayName).toBe('Pine Tree');
    expect(updated.bio).toBe('Evergreen.');
  });

  it('has no routes that list users or look them up by email', async () => {
    const a = await register(t.base, 'elm.e2e');
    expect((await api(t.base, a.token, '/users')).status).toBe(404);
    expect(
      (await api(t.base, a.token, '/users/email/elme2e@e2e.test')).status,
    ).toBe(404);
  });

  it('rejects photo uploads that are not images, whatever their name', async () => {
    const a = await register(t.base, 'cedar.e2e');
    const form = new FormData();
    form.append(
      'avatar',
      new Blob(['not an image'], { type: 'image/png' }),
      'avatar.png',
    );
    const res = await fetch(`${t.base}/api/users/me/avatar`, {
      method: 'POST',
      headers: { authorization: `Bearer ${a.token}` },
      body: form,
    });
    expect(res.status).toBe(400);
  });
});
