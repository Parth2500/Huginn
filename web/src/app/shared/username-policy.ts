/**
 * Client copy of chat-api/src/user/username.policy.ts, for instant feedback while typing.
 * The server re-checks everything; keep the two in step.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

const SHAPE = /^[A-Za-z][A-Za-z0-9._]*$/;
const SEPARATOR_RUN = /[._]{2,}/;
const TRAILING_SEPARATOR = /[._]$/;
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'sysadmin', 'support', 'help', 'helpdesk',
  'staff', 'team', 'moderator', 'mod', 'official', 'security', 'abuse', 'noreply',
  'chatapp',
  'huginn',
  'muninn',
  'heimdall', 'api', 'www', 'mail', 'postmaster', 'webmaster', 'info', 'contact',
  'me', 'you', 'everyone', 'here', 'all', 'channel', 'bot', 'null', 'undefined',
  'settings', 'profile', 'account', 'login', 'logout', 'signin', 'signup', 'register',
]);

export function normalizeUsername(raw: string | null | undefined): string {
  return (raw ?? '').normalize('NFKC').trim();
}

/** Why a username isn't allowed, or null when it is. Same messages as the server. */
export function usernameProblem(raw: string | null | undefined): string | null {
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
