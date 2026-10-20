import {
  normalizeUsername,
  usernameKey,
  usernameProblem,
} from './username.policy';

describe('username policy', () => {
  it.each(['sam', 'Sam_Rivera', 'maya.test', 'a12', 'Zoe2026'])(
    'accepts %s',
    (name) => {
      expect(usernameProblem(name)).toBeNull();
    },
  );

  it.each([
    ['ab', 'at least 3'],
    ['a'.repeat(25), 'at most 24'],
    ['9lives', 'start with a letter'],
    ['_sam', 'start with a letter'],
    ['sam rivera', 'English letters'],
    ['sam-rivera', 'English letters'],
    ['Zоe', 'English letters'], // Cyrillic "о"
    ['sam..r', 'next to each other'],
    ['sam._r', 'next to each other'],
    ['sam.', 'end with'],
    ['sam_', 'end with'],
  ])('rejects %s', (name, reason) => {
    expect(usernameProblem(name)).toContain(reason);
  });

  it.each(['admin', 'Admin', 'ad.min', 'sup_port', 'huginn', 'heimdall'])(
    'reserves %s, ignoring case and separators',
    (name) => {
      expect(usernameProblem(name)).toBe('That username is reserved.');
    },
  );

  it('normalises with NFKC before checking, so full-width letters fold to ASCII', () => {
    expect(normalizeUsername('  ｍａｙａ  ')).toBe('maya');
    expect(usernameProblem('ｍａｙａ')).toBeNull();
    expect(usernameKey('ｍａｙａ')).toBe('maya');
  });

  it('keys usernames case-insensitively', () => {
    expect(usernameKey('Sam.Rivera')).toBe(usernameKey('sam.rivera'));
  });
});
