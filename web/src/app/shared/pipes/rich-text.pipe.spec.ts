import { RichTextPipe } from './rich-text.pipe';

describe('RichTextPipe', () => {
  const pipe = new RichTextPipe();

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

  it('formats *bold*, _italic_, ~strike~ and `code`, dropping the markers', () => {
    expect(pipe.transform('Ship *today*, _maybe_ ~tomorrow~: `npm run build`')).toEqual([
      { text: 'Ship ' },
      { text: 'today', style: 'bold' },
      { text: ', ' },
      { text: 'maybe', style: 'italic' },
      { text: ' ' },
      { text: 'tomorrow', style: 'strike' },
      { text: ': ' },
      { text: 'npm run build', style: 'code' },
    ]);
  });

  it('leaves markers inside words and loose ones alone', () => {
    expect(pipe.transform('snake_case_name and 2*3*4 and * not bold *')).toEqual([
      { text: 'snake_case_name and 2*3*4 and * not bold *' },
    ]);
  });

  it('keeps code literal and links clickable next to formatting', () => {
    expect(pipe.transform('`*not bold*` see *https://a.dev*')).toEqual([
      { text: '*not bold*', style: 'code' },
      { text: ' see *' },
      { text: 'https://a.dev', href: 'https://a.dev' },
      { text: '*' },
    ]);
  });
});
