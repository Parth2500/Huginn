import { Injectable, inject, signal } from '@angular/core';
import { LocalDb, OutboxEntry } from './local-db';

/** A send with no acknowledgement after this long is shown as not confirmed. */
const STALL_MS = 10_000;

/**
 * Messages written but not yet acknowledged by the server. They're saved on the device first,
 * so a reload, a dropped connection or a server restart never loses them, and each carries a
 * clientMessageId so sending it twice stores it once.
 */
@Injectable({ providedIn: 'root' })
export class OutboxStore {
  private readonly db = inject(LocalDb);

  /** Oldest first: that's the order they go out in. */
  readonly entries = signal<OutboxEntry[]>([]);
  readonly stalled = signal(new Set<string>());

  restore(entries: OutboxEntry[]) {
    const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    this.entries.set(sorted);
    // Anything still here after a reload has been waiting a while.
    this.stalled.set(new Set(sorted.map((e) => e.clientMessageId)));
  }

  add(entry: OutboxEntry) {
    this.entries.update((list) => [...list, entry]);
    void this.db.putOutbox(entry);
    setTimeout(() => {
      if (this.entries().some((e) => e.clientMessageId === entry.clientMessageId)) {
        this.stalled.update((set) => new Set(set).add(entry.clientMessageId));
      }
    }, STALL_MS);
  }

  /** The first message to a person created the chat: later sends go to the chat itself. */
  attachToChat(toUserId: number, chatId: number) {
    const moved = this.entries().filter((e) => e.toUserId === toUserId);
    if (moved.length === 0) {
      return;
    }
    this.entries.update((list) =>
      list.map((e) =>
        e.toUserId === toUserId
          ? { ...e, toUserId: undefined, chatId }
          : e,
      ),
    );
    this.entries()
      .filter((e) => moved.some((m) => m.clientMessageId === e.clientMessageId))
      .forEach((e) => void this.db.putOutbox(e));
  }

  /** The next send to try: the oldest that the server hasn't refused. */
  next(): OutboxEntry | undefined {
    return this.entries().find((e) => !e.failed);
  }

  /** The server refused it: keep it, marked, until the person retries or deletes it. */
  fail(clientMessageId: string, reason: string) {
    this.patch(clientMessageId, { failed: reason });
  }

  retry(clientMessageId: string) {
    this.patch(clientMessageId, { failed: undefined });
  }

  private patch(clientMessageId: string, change: Partial<OutboxEntry>) {
    this.entries.update((list) =>
      list.map((e) => (e.clientMessageId === clientMessageId ? { ...e, ...change } : e)),
    );
    const entry = this.entries().find((e) => e.clientMessageId === clientMessageId);
    if (entry) {
      void this.db.putOutbox(entry);
    }
  }

  remove(clientMessageId: string) {
    this.entries.update((list) => list.filter((e) => e.clientMessageId !== clientMessageId));
    this.stalled.update((set) => {
      const copy = new Set(set);
      copy.delete(clientMessageId);
      return copy;
    });
    void this.db.deleteOutbox(clientMessageId);
  }

  reset() {
    this.entries.set([]);
    this.stalled.set(new Set());
  }
}
