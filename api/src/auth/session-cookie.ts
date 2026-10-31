import type { CookieOptions } from 'express';
import { SESSION_IDLE_MS } from './sessions.service';

/**
 * Secure cookies need HTTPS, except on localhost. They're on by default in production; set
 * SESSION_COOKIE_SECURE=false to serve over plain HTTP (for example a LAN address in development).
 */
const secure = () =>
  (process.env.SESSION_COOKIE_SECURE ??
    String(process.env.NODE_ENV === 'production')) === 'true';

/** `__Host-` makes the browser refuse the cookie unless it's Secure, host-only and for path /. */
export const cookieName = (base: string) =>
  secure() ? `__Host-${base}` : base;

export const sessionCookieName = () => cookieName('huginn_session');

/** httpOnly, SameSite=Lax (sent on the redirect back from Heimdall), whole site. */
export const cookieOptions = (maxAge: number): CookieOptions => ({
  httpOnly: true,
  secure: secure(),
  sameSite: 'lax',
  path: '/',
  maxAge,
});

export const sessionCookieOptions = () => cookieOptions(SESSION_IDLE_MS);

/** Options that clear a cookie set with cookieOptions. */
export const clearCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: secure(),
  sameSite: 'lax',
  path: '/',
});

/** One cookie from a Cookie header (HTTP requests and the Socket.IO handshake alike). */
export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  for (const part of cookieHeader?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export const readSessionToken = (cookieHeader?: string) =>
  readCookie(cookieHeader, sessionCookieName());

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
