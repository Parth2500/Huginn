import { Pipe, PipeTransform } from '@angular/core';

const TONE_COUNT = 8;

/**
 * Stable tone class, so a person or room keeps one colour everywhere.
 * Prefer the numeric id: ids are sequential, so neighbours never share a tone.
 */
@Pipe({ name: 'tone' })
export class TonePipe implements PipeTransform {
  transform(key: number | string | undefined | null): string {
    if (typeof key === 'number') {
      return `tone-${Math.abs(key) % TONE_COUNT}`;
    }
    const value = (key ?? '').toLowerCase();
    // FNV-1a: spreads short, similar names more evenly than a simple multiply hash.
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `tone-${(hash >>> 0) % TONE_COUNT}`;
  }
}

@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string | undefined | null): string {
    // Letters only, so "incident-0420" reads "IN" rather than "I0".
    const parts = (name ?? '').split(/[^\p{L}]+/u).filter(Boolean);
    if (parts.length === 0) {
      return (name ?? '?').trim().slice(0, 2).toUpperCase() || '?';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
