import { InitialsPipe, TonePipe } from './avatar.pipes';

describe('avatar pipes', () => {
  const initials = new InitialsPipe();
  const tone = new TonePipe();

  it('makes initials from letters only', () => {
    expect(initials.transform('Sam Rivera')).toBe('SR');
    expect(initials.transform('maya.test')).toBe('MT');
    expect(initials.transform('incident-0420')).toBe('IN');
    expect(initials.transform('')).toBe('?');
  });

  it('gives consecutive ids different tones, and the same id the same tone', () => {
    expect(tone.transform(1)).not.toBe(tone.transform(2));
    expect(tone.transform(7)).toBe(tone.transform(7));
    expect(tone.transform('Launch crew')).toMatch(/^tone-[0-7]$/);
  });
});
