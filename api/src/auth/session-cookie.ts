import { CookieOptions } from 'express';
import { SESSION_IDLE_MS } from './sessions.service';

/**
 * Secure cookies need HTTPS, except on localhost. They're on by default in production; set
 * SESSION_COOKIE_SECURE=false to serve over plain HTTP (for example a LAN address in development).
 */
const secure = () =>
  (process.env.SESSION_COOKIE_SECURE ??
    String(process.env.NODE_ENV === 'production')) === 'true';

/** `__Host-` makes the browser refuse the cookie unless it's Secure, host-only and for path /. */
export const sessionCookieName = () =>
  secure() ? '__Host-huginn_session' : 'huginn_session';

export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: secure(),
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_IDLE_MS,
});

/** The session token from a Cookie header (HTTP requests and the Socket.IO handshake alike). */
export function readSessionToken(cookieHeader?: string): string | undefined {
  const name = sessionCookieName();
  for (const part of cookieHeader?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/** Where the app is served from. Requests that change things must come from one of these. */
export const appOrigins = () =>
  (process.env.APP_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

/**
 * A cookie rides along on any request to the API, so changes and socket connections are
 * refused when a browser says they come from another site. Clients that aren't browsers send
 * no Origin and have no cookie to borrow.
 */
export function isForeignOrigin(headers: {
  origin?: string;
  'sec-fetch-site'?: string | string[];
}): boolean {
  if (headers['sec-fetch-site'] === 'cross-site') {
    return true;
  }
  return !!headers.origin && !appOrigins().includes(headers.origin);
}
