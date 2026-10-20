import { normalizeUsername, usernameProblem } from './username-policy';

// Mirrors the API policy tests: the client copy must give the same answers.
describe('username policy (client copy)', () => {
  it.each(['sam', 'Sam_Rivera', 'maya.test'])('accepts %s', (name) => {
    expect(usernameProblem(name)).toBeNull();
  });

  it.each([
    ['ab', 'at least 3'],
    ['9lives', 'start with a letter'],
    ['Zоe', 'English letters'],
    ['sam..r', 'next to each other'],
    ['sam_', 'end with'],
    ['ad.min', 'reserved'],
    ['Huginn', 'reserved'],
  ])('rejects %s', (name, reason) => {
    expect(usernameProblem(name)).toContain(reason);
  });

  it('folds full-width letters before checking', () => {
    expect(normalizeUsername('ｍａｙａ')).toBe('maya');
  });
});
