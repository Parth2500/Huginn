import { Pipe, PipeTransform } from '@angular/core';

export interface TextPart {
  text: string;
  href?: string;
}

// http(s) links, without trailing punctuation that usually ends the sentence.
const URL_PATTERN = /https?:\/\/[^\s<>"]+[^\s<>".,:;!?'")\]]/g;

/** Splits message text into plain and link parts; rendered as text nodes, never as HTML. */
@Pipe({ name: 'linkify' })
export class LinkifyPipe implements PipeTransform {
  transform(text: string | null | undefined): TextPart[] {
    const value = text ?? '';
    const parts: TextPart[] = [];
    let last = 0;
    for (const match of value.matchAll(URL_PATTERN)) {
      const start = match.index ?? 0;
      if (start > last) {
        parts.push({ text: value.slice(last, start) });
      }
      parts.push({ text: match[0], href: match[0] });
      last = start + match[0].length;
    }
    if (last < value.length) {
      parts.push({ text: value.slice(last) });
    }
    return parts;
  }
}
