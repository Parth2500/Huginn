import { Injectable, inject, signal } from '@angular/core';
import { LocalDb } from './local-db';

/** Writes to the device wait this long, so typing doesn't write on every key. */
const SAVE_MS = 400;

/**
 * Unsent text per conversation (product-spec.md §3.8), on this device only until Phase 2. Keyed
 * `c<chatId>` for a chat, or `u<userId>` for a draft chat with someone you haven't written to.
 */
@Injectable({ providedIn: 'root' })
export class DraftsStore {
  private readonly db = inject(LocalDb);
  readonly drafts = signal(new Map<string, string>());
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  restore(drafts: Record<string, string>) {
    this.drafts.set(new Map(Object.entries(drafts)));
  }

  get(key: string): string {
    return this.drafts().get(key) ?? '';
  }

  /** Empty (or only spaces) removes the draft. */
  set(key: string, text: string) {
    const current = this.get(key);
    if (current === text) {
      return;
    }
    this.drafts.update((map) => {
      const copy = new Map(map);
      if (text.trim()) {
        copy.set(key, text);
      } else {
        copy.delete(key);
      }
      return copy;
    });
    this.save();
  }

  /** A draft chat became a real one: its text follows. */
  move(from: string, to: string) {
    const text = this.get(from);
    if (text) {
      this.set(from, '');
      this.set(to, text);
    }
  }

  reset() {
    clearTimeout(this.saveTimer);
    this.drafts.set(new Map());
  }

  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.db.setDrafts(Object.fromEntries(this.drafts())), SAVE_MS);
  }
}
