import { LinkifyPipe } from './linkify.pipe';

describe('LinkifyPipe', () => {
  const pipe = new LinkifyPipe();

  it('splits links out of text, leaving the rest as plain parts', () => {
    expect(pipe.transform('Docs: https://angular.dev/guide. Thanks!')).toEqual([
      { text: 'Docs: ' },
      { text: 'https://angular.dev/guide', href: 'https://angular.dev/guide' },
      { text: '. Thanks!' },
    ]);
  });

  it('never treats markup as anything but text', () => {
    const parts = pipe.transform('<img src=x onerror=alert(1)>');
    expect(parts).toEqual([{ text: '<img src=x onerror=alert(1)>' }]);
  });

  it('ignores non-http schemes', () => {
    expect(pipe.transform('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });
});
