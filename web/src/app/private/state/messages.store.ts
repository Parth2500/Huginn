import { Injectable, inject, signal } from '@angular/core';
import { ChatMessage } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import { withUpdatedSender } from '../helpers/chat-display';
import { LocalDb } from './local-db';

export interface ChatHistory {
  /** Oldest first, by server id (insertion order). */
  messages: ChatMessage[];
  /** Older messages exist on the server beyond these. */
  hasMore: boolean;
  /** The server has answered at least once since this chat was opened. */
  loaded: boolean;
}

/** Message history per chat, merged from the device cache, history pages and live updates. */
@Injectable({ providedIn: 'root' })
export class MessagesStore {
  private readonly db = inject(LocalDb);
  private readonly histories = signal(new Map<number, ChatHistory>());

  history(chatId: number | undefined): ChatHistory | undefined {
    return chatId === undefined ? undefined : this.histories().get(chatId);
  }

  /** Shows what the device holds for a chat while the server is asked for the latest. */
  async restore(chatId: number) {
    if (this.history(chatId)) {
      return;
    }
    const [messages, hasMore] = await Promise.all([
      this.db.getMessages(chatId),
      this.db.getHasMore(chatId),
    ]);
    if (this.history(chatId)) {
      return; // the server answered first
    }
    this.set(chatId, {
      messages: messages.sort(byId),
      hasMore: hasMore ?? true,
      loaded: false,
    });
  }

  /**
   * The newest page from the server. It joins what the device holds when the two overlap;
   * otherwise the device missed messages in between and the page replaces them.
   */
  applyLatest(chatId: number, page: ChatMessage[], hasMore: boolean) {
    const current = this.history(chatId);
    const known = current?.messages ?? [];
    const oldestInPage = page.length ? Math.min(...page.map((m) => m.id)) : Infinity;
    const newestKnown = known.length ? known[known.length - 1].id : -Infinity;
    const overlaps = known.length === 0 || newestKnown >= oldestInPage || !hasMore;
    const messages = overlaps ? merge(known, page) : [...page].sort(byId);
    const keepsOlder = overlaps && known.length > 0 && known[0].id < oldestInPage;
    const next = { messages, hasMore: keepsOlder ? current!.hasMore : hasMore, loaded: true };
    this.set(chatId, next);
    void this.db.putMessages(page);
    void this.db.setHasMore(chatId, next.hasMore);
  }

  applyOlder(chatId: number, page: ChatMessage[], hasMore: boolean) {
    const current = this.history(chatId);
    this.set(chatId, {
      messages: merge(current?.messages ?? [], page),
      hasMore,
      loaded: true,
    });
    void this.db.putMessages(page);
    void this.db.setHasMore(chatId, hasMore);
  }

  /** A new message, live or from catch-up. Kept even for chats not opened yet. */
  add(message: ChatMessage) {
    const current = this.history(message.chatId);
    if (current?.messages.some((m) => m.id === message.id)) {
      return;
    }
    void this.db.putMessages([message]);
    if (current) {
      this.set(message.chatId, { ...current, messages: merge(current.messages, [message]) });
    }
  }

  /** "Clear chat" (here or on another device): messages up to `upTo` are gone for you. */
  clearUpTo(chatId: number, upTo: number) {
    const current = this.history(chatId);
    if (current) {
      this.set(chatId, { ...current, messages: current.messages.filter((m) => m.id > upTo) });
    }
    void this.db.deleteMessages(chatId, upTo);
  }

  applyUser(user: IUser) {
    this.histories.update((map) => {
      const copy = new Map<number, ChatHistory>();
      for (const [chatId, history] of map) {
        copy.set(chatId, {
          ...history,
          messages: history.messages.map((m) => withUpdatedSender(m, user)),
        });
      }
      return copy;
    });
  }

  /** After a full reload the cache was cleared; drop what's in memory too. */
  clear() {
    this.histories.set(new Map());
  }

  private set(chatId: number, history: ChatHistory) {
    this.histories.update((map) => new Map(map).set(chatId, history));
  }
}

function byId(a: ChatMessage, b: ChatMessage) {
  return a.id - b.id;
}

function merge(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const map = new Map<number, ChatMessage>();
  [...a, ...b].forEach((m) => map.set(m.id, m));
  return [...map.values()].sort(byId);
}
