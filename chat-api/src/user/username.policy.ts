/**
 * Username policy (Telegram-style handles).
 *
 * 1. Normalise: Unicode NFKC, then trim. NFKC folds look-alike forms (full-width "ａｄｍｉｎ",
 *    ligatures) into their plain equivalents before any rule runs.
 * 2. Shape: 3–24 characters, ASCII only, starting with a letter; then letters, digits, "." or "_".
 *    ASCII-only closes the homoglyph hole (Cyrillic "а" posing as Latin "a").
 * 3. Separators: no "..", "__", "._" or "_." runs, and no trailing separator, so names stay
 *    readable and "a..b" / "a__b" can't impersonate "a.b".
 * 4. Reserved: names that could pass for the service or staff are blocked, compared with
 *    separators removed so "ad.min" or "sup_port" are caught too.
 * 5. Uniqueness is on the canonical key (lower case), while the owner's casing is kept for display.
 *
 * The Angular app carries a copy of these rules for instant feedback; this file is the authority.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

const SHAPE = /^[A-Za-z][A-Za-z0-9._]*$/;
const SEPARATOR_RUN = /[._]{2,}/;
const TRAILING_SEPARATOR = /[._]$/;

const RESERVED = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'sysadmin',
  'support',
  'help',
  'helpdesk',
  'staff',
  'team',
  'moderator',
  'mod',
  'official',
  'security',
  'abuse',
  'noreply',
  'chatapp',
  'api',
  'www',
  'mail',
  'postmaster',
  'webmaster',
  'info',
  'contact',
  'me',
  'you',
  'everyone',
  'here',
  'all',
  'channel',
  'bot',
  'null',
  'undefined',
  'settings',
  'profile',
  'account',
  'login',
  'logout',
  'signin',
  'signup',
  'register',
]);

/** The form usernames are compared and stored by for uniqueness. */
export function usernameKey(raw: string): string {
  return normalizeUsername(raw).toLowerCase();
}

export function normalizeUsername(raw: string): string {
  return (raw ?? '').normalize('NFKC').trim();
}

/** Returns why a username is not allowed, or null when it is. */
export function usernameProblem(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < USERNAME_MIN_LENGTH) {
    return `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (name.length > USERNAME_MAX_LENGTH) {
    return `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!/^[A-Za-z]/.test(name)) {
    return 'Usernames must start with a letter.';
  }
  if (!SHAPE.test(name)) {
    return 'Use only English letters, numbers, dots and underscores.';
  }
  if (SEPARATOR_RUN.test(name)) {
    return "Dots and underscores can't sit next to each other.";
  }
  if (TRAILING_SEPARATOR.test(name)) {
    return "Usernames can't end with a dot or underscore.";
  }
  if (RESERVED.has(name.toLowerCase().replace(/[._]/g, ''))) {
    return 'That username is reserved.';
  }
  return null;
}
