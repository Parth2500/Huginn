import { Pipe, PipeTransform } from '@angular/core';

export type TextStyle = 'bold' | 'italic' | 'strike' | 'code';

export interface TextPart {
  text: string;
  href?: string;
  style?: TextStyle;
}

// http(s) links, without trailing punctuation that usually ends the sentence (or a closing
// formatting marker, as in *https://a.dev*).
const URL_PATTERN = /https?:\/\/[^\s<>"]+[^\s<>".,:;!?'")\]*~]/g;

/**
 * `code`, or *bold*, _italic_ and ~strike~ that start and end at word edges, so snake_case and
 * 2*3*4 stay as written. Groups: 1 code; 2 what comes before; 3 the marker; 4 the text.
 */
const FORMAT_PATTERN = /`([^`\n]+)`|(^|[\s([{"'])([*_~])(?!\s)([^\n]*?\S)\3(?=$|[\s)\]}.,!?;:"'])/g;

const STYLES: Record<string, TextStyle> = { '*': 'bold', _: 'italic', '~': 'strike' };

/**
 * Splits message text into plain, link and formatted parts (product-spec.md §3.11). The parts
 * are rendered as text nodes in elements the template chooses, never as HTML.
 */
@Pipe({ name: 'richText' })
export class RichTextPipe implements PipeTransform {
  transform(text: string | null | undefined): TextPart[] {
    const value = text ?? '';
    const parts: TextPart[] = [];
    let last = 0;
    for (const match of value.matchAll(URL_PATTERN)) {
      const start = match.index ?? 0;
      if (start > last) {
        parts.push(...formatted(value.slice(last, start)));
      }
      parts.push({ text: match[0], href: match[0] });
      last = start + match[0].length;
    }
    if (last < value.length) {
      parts.push(...formatted(value.slice(last)));
    }
    return parts;
  }
}

function formatted(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  const plain = (to: number) => {
    if (to > last) {
      parts.push({ text: text.slice(last, to) });
    }
  };
  for (const match of text.matchAll(FORMAT_PATTERN)) {
    const start = match.index ?? 0;
    if (match[1] !== undefined) {
      plain(start);
      parts.push({ text: match[1], style: 'code' });
    } else {
      plain(start + match[2].length);
      parts.push({ text: match[4], style: STYLES[match[3]] });
    }
    last = start + match[0].length;
  }
  plain(text.length);
  return parts;
}
