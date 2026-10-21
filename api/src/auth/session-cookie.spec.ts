import {
  isForeignOrigin,
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from './session-cookie';

describe('session cookie', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('is a __Host- Secure cookie in production, and plain on HTTP in development', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_COOKIE_SECURE;
    expect(sessionCookieName()).toBe('__Host-huginn_session');
    expect(sessionCookieOptions()).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    process.env.NODE_ENV = 'development';
    expect(sessionCookieName()).toBe('huginn_session');
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it('reads its own cookie and ignores look-alikes', () => {
    process.env.NODE_ENV = 'test';
    expect(readSessionToken('a=1; huginn_session=abc%2Fd; b=2')).toBe('abc/d');
    expect(readSessionToken('xhuginn_session=nope')).toBeUndefined();
    expect(readSessionToken(undefined)).toBeUndefined();
  });

  it('treats other sites as foreign, and requests without an Origin as not', () => {
    process.env.APP_ORIGINS = 'https://huginn.example, http://localhost:4200';
    expect(isForeignOrigin({ origin: 'https://huginn.example' })).toBe(false);
    expect(isForeignOrigin({})).toBe(false);
    expect(isForeignOrigin({ origin: 'https://evil.example' })).toBe(true);
    expect(isForeignOrigin({ 'sec-fetch-site': 'cross-site' })).toBe(true);
  });
});
