import { Injectable, computed, inject, signal } from '@angular/core';
import { Chat, ChatCursor, ChatMessage, MyChatState } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import { byActivity, byListOrder, isMuted, withUpdatedUser } from '../helpers/chat-display';
import { LocalDb } from './local-db';

/** How long a chat that arrived live keeps its highlight. */
const FRESH_MS = 2400;

/** The signed-in person's chats, kept current by the sync engine. */
@Injectable({ providedIn: 'root' })
export class ChatsStore {
  private readonly db = inject(LocalDb);
  private readonly byId = signal(new Map<number, Chat>());

  /** False until the cache or the server has answered once. */
  readonly loaded = signal(false);
  /** Where the next page of older chats starts, when the server has more. */
  readonly next = signal<ChatCursor | null>(null);
  /** The same for the Archived folder; `undefined` until it's first opened. */
  readonly nextArchived = signal<ChatCursor | null | undefined>(undefined);
  /** What the folder rows above the list show. */
  readonly folders = signal({ archived: { count: 0, unread: 0 } });
  /** Chats that arrived live this session, highlighted briefly. */
  readonly fresh = signal(new Set<number>());

  /** Every chat this device holds, archived included (search uses these). */
  readonly chats = computed(() => [...this.byId().values()].sort(byActivity));
  /** The main list: not archived; pinned first. */
  readonly mainChats = computed(() =>
    this.chats()
      .filter((chat) => !chat.me.archivedAt)
      .sort(byListOrder),
  );
  readonly archivedChats = computed(() => this.chats().filter((chat) => !!chat.me.archivedAt));
  readonly pinnedCount = computed(() => this.mainChats().filter((chat) => !!chat.me.pinnedAt).length);
  /** For the tab title: archived and muted chats don't call for attention. */
  readonly totalUnread = computed(() =>
    this.mainChats()
      .filter((chat) => !isMuted(chat))
      .reduce((sum, chat) => sum + chat.unreadCount, 0),
  );

  get(chatId: number): Chat | undefined {
    return this.byId().get(chatId);
  }

  directWith(userId: number): Chat | undefined {
    return this.chats().find(
      (chat) => chat.kind === 'direct' && chat.members.some((m) => m.Id === userId),
    );
  }

  /** Cached chats, shown before the server answers. */
  restore(chats: Chat[]) {
    this.byId.set(new Map(chats.map((chat) => [chat.id, chat])));
    this.loaded.set(chats.length > 0);
  }

  /** A full reload from the server (first sign-in on this device, or too far behind). */
  replace(chats: Chat[], next: ChatCursor | null) {
    this.byId.set(new Map(chats.map((chat) => [chat.id, chat])));
    this.next.set(next);
    this.loaded.set(true);
    void this.db.replaceChats(chats);
  }

  upsert(chats: Chat[], options: { fresh?: boolean } = {}) {
    if (chats.length === 0) {
      return;
    }
    this.byId.update((map) => {
      const copy = new Map(map);
      chats.forEach((chat) => copy.set(chat.id, chat));
      return copy;
    });
    if (options.fresh) {
      this.markFresh(chats.map((chat) => chat.id));
    }
    void this.db.putChats(chats);
  }

  /** Adds an older page of chats from `chats.list`. */
  append(chats: Chat[], next: ChatCursor | null) {
    this.upsert(chats);
    this.next.set(next);
  }

  appendArchived(chats: Chat[], next: ChatCursor | null) {
    this.upsert(chats);
    this.nextArchived.set(next);
  }

  /**
   * A new message: it becomes the chat's preview and moves the chat up. `countUnread` is false
   * when it's your own message or you're looking at the chat. Returns false for an unknown chat.
   */
  applyMessage(message: ChatMessage, countUnread: boolean): boolean {
    const chat = this.get(message.chatId);
    if (!chat) {
      return false;
    }
    if (chat.lastMessage && chat.lastMessage.id >= message.id) {
      return true; // already applied (the ack and the update both carry it)
    }
    this.upsert([
      {
        ...chat,
        lastMessage: message,
        lastActivityAt: message.createdAt,
        unreadCount: chat.unreadCount + (countUnread ? 1 : 0),
      },
    ]);
    return true;
  }

  applyState(chatId: number, me: MyChatState, unreadCount: number) {
    const chat = this.get(chatId);
    if (chat) {
      this.upsert([{ ...chat, me, unreadCount }]);
    }
  }

  /** Reading up to a message, before the server confirms it. */
  markReadLocally(chatId: number, upTo: number) {
    const chat = this.get(chatId);
    if (chat && (chat.unreadCount > 0 || chat.me.lastReadMessageId < upTo)) {
      this.upsert([
        {
          ...chat,
          unreadCount: 0,
          me: {
            ...chat.me,
            lastReadMessageId: Math.max(chat.me.lastReadMessageId, upTo),
            markedUnread: false,
          },
        },
      ]);
    }
  }

  /** A name, photo or bio changed: update every copy we hold. */
  applyUser(user: IUser) {
    const affected = this.chats().filter(
      (chat) =>
        chat.members.some((m) => m.Id === user.Id) || chat.lastMessage?.sender?.Id === user.Id,
    );
    this.upsert(affected.map((chat) => withUpdatedUser(chat, user)));
  }

  reset() {
    this.byId.set(new Map());
    this.next.set(null);
    this.nextArchived.set(undefined);
    this.folders.set({ archived: { count: 0, unread: 0 } });
    this.loaded.set(false);
    this.fresh.set(new Set());
  }

  private markFresh(ids: number[]) {
    this.fresh.update((set) => new Set([...set, ...ids]));
    setTimeout(
      () =>
        this.fresh.update((set) => {
          const copy = new Set(set);
          ids.forEach((id) => copy.delete(id));
          return copy;
        }),
      FRESH_MS,
    );
  }
}
