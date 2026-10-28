import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  Chat,
  ChatCursor,
  ChatMessage,
  ChatStateChange,
  ChatStateResult,
  MessageInfoEntry,
  MyChatState,
  Notice,
  NotificationSettings,
  PROTOCOL_VERSION,
  Settings,
  TypingEvent,
  Update,
} from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import { ChatsStore } from '../state/chats.store';
import { LocalDb } from '../state/local-db';
import { MessagesStore } from '../state/messages.store';
import { DraftsStore } from '../state/drafts.store';
import { OutboxStore } from '../state/outbox.store';
import { CustomSocketService } from './custom-socket.service';

export type ConnectionState = 'connecting' | 'online' | 'offline';

/** Wait before retrying a send the server didn't acknowledge. */
const RETRY_MS = 3000;
/** Delivered receipts go out at most this often, one per chat (architecture.md §6). */
const DELIVERED_BATCH_MS = 300;

/**
 * The client half of realtime protocol v1 (docs/huginn/architecture.md §4–6).
 *
 * - On every (re)connect the server says `hello { seq }`. The engine catches up from the last
 *   update it applied (`sync`), or reloads the chat list when this device has nothing yet or
 *   fell too far behind.
 * - Live `update`s apply in sequence order. A gap (a missed update) triggers a catch-up first.
 * - Sends go through the outbox and are retried until acknowledged; the server stores each
 *   clientMessageId once, so retries are safe.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly socket = inject(CustomSocketService);
  private readonly db = inject(LocalDb);
  private readonly chats = inject(ChatsStore);
  private readonly messages = inject(MessagesStore);
  private readonly outbox = inject(OutboxStore);
  private readonly drafts = inject(DraftsStore);

  readonly connection = signal<ConnectionState>('connecting');
  readonly onlineIds = signal(new Set<number>());
  /** Things worth a toast: being added to a group, a send the server refused. */
  readonly notices = new Subject<{ kind: 'info' | 'error'; text: string }>();
  readonly unauthorized = new Subject<string>();
  readonly typing = new Subject<TypingEvent>();
  readonly userUpdated = new Subject<IUser>();
  /** Read receipts on (product-spec.md §5.4): sharing yours, and seeing other people's. */
  readonly readReceipts = signal(true);
  /** Notification settings (product-spec.md §6.2), the same on every device. */
  readonly notificationSettings = signal<NotificationSettings>({
    notifyPreviews: true,
    notifySounds: true,
    groupNotifyMode: 'all',
    mentionsBreakMute: true,
    dndUntil: null,
  });
  /** A new message worth telling you about. NotificationsService decides how. */
  readonly notify = new Subject<Notice>();

  private me: IUser | null = null;
  private seq = 0;
  private catchingUp: Promise<void> | null = null;
  private buffered: Update[] = [];
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** The chat on screen: its messages don't count as unread while the tab is visible. */
  private viewingChatId: number | undefined;
  private started = false;
  /** Newest message received per chat, waiting to be reported as delivered. */
  private deliveredQueue = new Map<number, number>();
  private deliveredTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const socket = this.socket;
    socket.on('connect', () => this.connection.set('connecting'));
    socket.on('disconnect', () => this.connection.set('offline'));
    socket.on('connect_error', () => this.connection.set('offline'));
    socket.ioSocket.io.on('reconnect_attempt', () => this.connection.set('connecting'));
    socket.on('hello', (hello: { protocol: number; seq: number }) => void this.onHello(hello));
    socket.on('update', (update: Update) => void this.onUpdate(update));
    socket.on('unauthorized', ({ message }: { message: string }) => this.unauthorized.next(message));
    socket.on('typing', (event: TypingEvent) => this.typing.next(event));
    socket.on('userUpdated', (user: IUser) => this.onUserUpdated(user));
    socket.on('settings', (settings: Settings) => this.applySettings(settings));
    socket.on('notify', (notice: Notice) => this.notify.next(notice));
    socket.on('onlineUsers', (ids: number[]) => this.onlineIds.set(new Set(ids)));
    // New contacts (a new chat or group): who of them is online right now.
    socket.on('presenceBatch', (ids: number[]) =>
      this.onlineIds.update((set) => new Set([...set, ...ids])),
    );
    socket.on('presence', ({ userId, online }: { userId: number; online: boolean }) =>
      this.onlineIds.update((set) => {
        const copy = new Set(set);
        if (online) {
          copy.add(userId);
        } else {
          copy.delete(userId);
        }
        return copy;
      }),
    );
  }

  /** Shows the device's copy at once, then connects and catches up. */
  async start(me: IUser) {
    if (this.started && this.me?.Id === me.Id) {
      this.socket.connectAs(me.Id!);
      return;
    }
    this.stop();
    this.started = true;
    this.me = me;
    this.db.open(me.Id!);
    const [chats, outbox, seq, drafts] = await Promise.all([
      this.db.getChats(),
      this.db.getOutbox(),
      this.db.getSeq(),
      this.db.getDrafts(),
    ]);
    if (this.me?.Id !== me.Id) {
      return; // signed out while the cache loaded
    }
    this.chats.restore(chats);
    this.outbox.restore(outbox);
    this.drafts.restore(drafts);
    this.seq = seq ?? 0;
    this.connection.set('connecting');
    this.socket.connectAs(me.Id!);
  }

  stop() {
    this.started = false;
    this.me = null;
    this.socket.disconnect();
    clearTimeout(this.retryTimer);
    this.catchingUp = null;
    this.buffered = [];
    this.viewingChatId = undefined;
    this.chats.reset();
    this.messages.clear();
    this.outbox.reset();
    this.drafts.reset();
    this.onlineIds.set(new Set());
    this.db.close();
  }

  /** Signing out also removes this account's data from the device. */
  async signOut() {
    const id = this.me?.Id;
    this.stop();
    if (id !== undefined) {
      await this.db.destroy(id);
    }
  }

  // ---- Chats ---------------------------------------------------------------------------------

  /**
   * Pins, archives, mutes, marks read or unread, clears or deletes chats (`chat.state`).
   * Returns null when it worked, or the reason it didn't, to show as is.
   */
  async changeState(chatIds: number[], change: ChatStateChange): Promise<string | null> {
    const result = await this.socket.request<{ results: ChatStateResult[] }>('chat.state', {
      chatIds,
      ...change,
    });
    if (!result.ok) {
      return result.error === 'offline'
        ? "You're offline. Try again when the connection is back."
        : result.error;
    }
    for (const { chatId, me, unreadCount } of result.results) {
      this.applyState(chatId, me, unreadCount);
    }
    if ('archive' in change || 'pin' in change || 'delete' in change) {
      void this.loadFolders();
    }
    return null;
  }

  /**
   * Puts the pinned chats in this order (`chat.pins`), at once on screen. If the server refuses,
   * the old order comes back and the reason is returned.
   */
  async reorderPins(chatIds: number[]): Promise<string | null> {
    const before = this.chats
      .mainChats()
      .filter((chat) => !!chat.me.pinnedAt)
      .map((chat) => chat.id);
    this.chats.applyPinOrder(chatIds);
    const result = await this.socket.request<{ results: ChatStateResult[] }>('chat.pins', {
      chatIds,
    });
    if (!result.ok) {
      this.chats.applyPinOrder(before);
      return result.error === 'offline'
        ? "You're offline. Try again when the connection is back."
        : result.error;
    }
    for (const { chatId, me, unreadCount } of result.results) {
      this.applyState(chatId, me, unreadCount);
    }
    return null;
  }

  /**
   * Deletes messages for me or for everyone (`message.delete`). Returns null when it worked, or
   * the reason it didn't. Deleting for me disappears at once; for everyone, the update that
   * comes back turns them into tombstones on every device.
   */
  async deleteMessages(chatId: number, messageIds: number[], scope: 'me' | 'all'): Promise<string | null> {
    const result = await this.socket.request('message.delete', { messageIds, scope });
    if (!result.ok) {
      return result.error === 'offline'
        ? "You're offline. Try again when the connection is back."
        : result.error;
    }
    if (scope === 'me') {
      this.applyHidden(chatId, messageIds);
    }
    return null;
  }

  /** Turns read receipts on or off, for every device. Returns the reason it failed, or null. */
  async setReadReceipts(on: boolean): Promise<string | null> {
    return this.updateSettings({ readReceipts: on });
  }

  /** Changes notification settings, for every device. Returns the reason it failed, or null. */
  updateNotificationSettings(change: Partial<NotificationSettings>): Promise<string | null> {
    return this.updateSettings(change);
  }

  /** True when this chat is on screen in a visible tab: nothing to notify about. */
  isLookingAt(chatId: number): boolean {
    return this.viewingChatId === chatId && document.visibilityState === 'visible';
  }

  private async updateSettings(change: Partial<Settings>): Promise<string | null> {
    const result = await this.socket.request<{ settings: Settings }>('settings.update', change);
    if (!result.ok) {
      return result.error === 'offline'
        ? "You're offline. Try again when the connection is back."
        : result.error;
    }
    this.applySettings(result.settings);
    return null;
  }

  /** Edits your own message (`message.edit`). Returns null, or why it couldn't be edited. */
  async editMessage(messageId: number, text: string): Promise<string | null> {
    const result = await this.socket.request<{ message: ChatMessage }>('message.edit', { messageId, text });
    if (!result.ok) {
      return result.error === 'offline'
        ? "You're offline. Try again when the connection is back."
        : result.error;
    }
    this.messages.replace(result.message);
    this.chats.applyChanged(result.message);
    return null;
  }

  /** Who your message reached and read it (`message.info`); a string is why it couldn't load. */
  async messageInfo(
    messageId: number,
  ): Promise<{ entries: MessageInfoEntry[]; readCount: number } | string> {
    const result = await this.socket.request<{ entries: MessageInfoEntry[]; readCount: number }>(
      'message.info',
      { messageId },
    );
    if (!result.ok) {
      return result.error === 'offline' ? "You're offline. Info shows when the connection is back." : result.error;
    }
    return { entries: result.entries, readCount: result.readCount };
  }

  /** A send the server refused: try it again. */
  retrySend(clientMessageId: string) {
    this.outbox.retry(clientMessageId);
    void this.flushOutbox();
  }

  /** A send the server refused: drop it. */
  discardSend(clientMessageId: string) {
    this.outbox.remove(clientMessageId);
  }

  /** The Archived row's numbers. */
  async loadFolders() {
    const result = await this.socket.request<{ archived: { count: number; unread: number } }>(
      'chats.folders',
    );
    if (result.ok) {
      this.chats.folders.set({ archived: result.archived });
    }
  }

  /** The Archived folder: its first page when opened, then older pages on request. */
  async loadArchived(more = false) {
    const before = more ? this.chats.nextArchived() : undefined;
    if (more && !before) {
      return;
    }
    const page = await this.socket.request<{ chats: Chat[]; next: ChatCursor | null }>(
      'chats.list',
      { folder: 'archived', ...(before ? { before } : {}) },
    );
    if (page.ok) {
      this.chats.appendArchived(page.chats, page.next);
    }
  }

  async loadMoreChats() {
    const before = this.chats.next();
    if (!before) {
      return;
    }
    const page = await this.socket.request<{ chats: Chat[]; next: ChatCursor | null }>(
      'chats.list',
      { before },
    );
    if (page.ok) {
      this.chats.append(page.chats, page.next);
    }
  }

  /** The direct chat with a person, or null when none exists yet (open a draft). */
  async findDirect(userId: number): Promise<{ partner: IUser; chat: Chat | null } | null> {
    const known = this.chats.directWith(userId);
    if (known) {
      return { partner: known.members.find((m) => m.Id === userId)!, chat: known };
    }
    const result = await this.socket.request<{ partner: IUser; chat: Chat | null }>(
      'direct.open',
      { userId },
    );
    if (!result.ok) {
      this.reportFailure(result.error, "Couldn't open that chat.");
      return null;
    }
    if (result.chat) {
      this.chats.upsert([result.chat]);
    }
    return { partner: result.partner, chat: result.chat };
  }

  async createGroup(input: { title: string; description?: string; memberIds: number[] }) {
    const result = await this.socket.request<{ chat: Chat }>('group.create', input);
    if (!result.ok) {
      this.reportFailure(result.error, "Couldn't create the group.");
      return null;
    }
    this.chats.upsert([result.chat]);
    return result.chat;
  }

  // ---- Messages ------------------------------------------------------------------------------

  /** The chat pane opened a chat: show the cache, then the server's latest page. */
  async openChat(chatId: number) {
    this.viewingChatId = chatId;
    await this.messages.restore(chatId);
    await this.refreshOpenChat();
  }

  closeChat(chatId: number) {
    if (this.viewingChatId === chatId) {
      this.viewingChatId = undefined;
      void this.socket.request('chat.close');
    }
  }

  async loadOlder(chatId: number) {
    const oldest = this.messages.history(chatId)?.messages[0]?.id;
    const page = await this.socket.request<{ messages: ChatMessage[]; hasMore: boolean }>(
      'messages.page',
      { chatId, before: oldest },
    );
    if (page.ok) {
      this.messages.applyOlder(chatId, page.messages, page.hasMore);
    }
    return page.ok;
  }

  /**
   * Queues a message. `toUserId` sends the first message to a person, creating the chat; `replyTo`
   * quotes a message in the same chat.
   */
  send(
    target: { chatId: number } | { toUserId: number },
    text: string,
    replyTo?: { id: number; senderId: number | null; excerpt: string | null },
  ) {
    this.outbox.add({
      clientMessageId: crypto.randomUUID(),
      ...target,
      text,
      createdAt: new Date().toISOString(),
      ...(replyTo ? { replyToMessageId: replyTo.id, replyTo } : {}),
    });
    void this.flushOutbox();
  }

  /** Marks the chat read up to its newest message (when it's on screen and the tab is visible). */
  markRead(chatId: number) {
    const chat = this.chats.get(chatId);
    const newest = this.messages.history(chatId)?.messages.at(-1)?.id ?? chat?.lastMessage?.id;
    if (!chat || newest === undefined) {
      return;
    }
    if (chat.unreadCount === 0 && chat.me.lastReadMessageId >= newest && !chat.me.markedUnread) {
      return;
    }
    this.chats.markReadLocally(chatId, newest);
    void this.socket.request('chat.read', { chatId, upTo: newest });
  }

  sendTyping(chatId: number) {
    this.socket.emit('typing', { chatId });
  }

  // ---- Sync ----------------------------------------------------------------------------------

  private async onHello(hello: { protocol: number; seq: number }) {
    if (hello.protocol !== PROTOCOL_VERSION) {
      this.notices.next({
        kind: 'error',
        text: 'Huginn was updated. Reload the page to keep chatting.',
      });
    }
    await this.catchUp(hello.seq);
    this.connection.set('online');
    this.reportUndelivered();
    void this.loadSettings();
    void this.loadFolders();
    void this.flushOutbox();
    await this.refreshOpenChat();
  }

  private onUpdate(update: Update) {
    if (this.catchingUp) {
      this.buffered.push(update);
      return;
    }
    if (update.seq <= this.seq) {
      return; // already applied
    }
    if (update.seq > this.seq + 1) {
      // Missed something in between: catch up, then this one applies from the buffer.
      this.buffered.push(update);
      void this.catchUp();
      return;
    }
    this.apply(update, true);
    this.setSeq(update.seq);
  }

  /** Brings this device up to date. Concurrent calls share one run. */
  private catchUp(serverSeq?: number): Promise<void> {
    if (!this.catchingUp) {
      this.catchingUp = this.runCatchUp(serverSeq).finally(() => {
        this.catchingUp = null;
        const pending = this.buffered.sort((a, b) => a.seq - b.seq);
        this.buffered = [];
        pending.forEach((update) => this.onUpdate(update));
      });
    }
    return this.catchingUp;
  }

  private async runCatchUp(serverSeq?: number) {
    const me = this.me;
    const cached = this.chats.loaded();
    if (!cached || this.seq === 0) {
      await this.reload(serverSeq);
      return;
    }
    for (;;) {
      const result = await this.socket.request<{
        updates: Update[];
        seq: number;
        hasMore: boolean;
        reset: boolean;
      }>('sync', { sinceSeq: this.seq });
      if (!result.ok || this.me !== me) {
        return;
      }
      if (result.reset) {
        await this.reload(result.seq);
        return;
      }
      for (const update of result.updates) {
        if (update.seq > this.seq) {
          this.apply(update, false);
          this.setSeq(update.seq);
        }
      }
      if (!result.hasMore) {
        return;
      }
    }
  }

  /** Starts from the server's current state: the chat list, from sequence `serverSeq` on. */
  private async reload(serverSeq?: number) {
    const me = this.me;
    let seq = serverSeq;
    if (seq === undefined) {
      // Asking for updates after "everything" returns none, plus the current sequence number.
      const current = await this.socket.request<{ seq: number }>('sync', {
        sinceSeq: Number.MAX_SAFE_INTEGER,
      });
      seq = current.ok ? current.seq : undefined;
    }
    const page = await this.socket.request<{ chats: Chat[]; next: ChatCursor | null }>(
      'chats.list',
    );
    if (!page.ok || this.me !== me) {
      return;
    }
    this.messages.clear();
    this.chats.replace(page.chats, page.next);
    if (seq !== undefined) {
      this.setSeq(seq);
    }
  }

  private apply(update: Update, live: boolean) {
    switch (update.type) {
      case 'chat.new': {
        const chat = update.data.chat;
        const isNew = !this.chats.get(chat.id);
        this.chats.upsert([chat], { fresh: live && isNew });
        this.outboxFollows(chat);
        if (live && isNew && chat.kind === 'group' && chat.me.role !== 'owner') {
          this.notices.next({ kind: 'info', text: `You were added to the group “${chat.title}”.` });
        }
        return;
      }
      case 'message.new': {
        const message = update.data.message;
        this.messages.add(message);
        const mine = message.sender?.Id === this.me?.Id;
        if (!mine) {
          this.queueDelivered(message.chatId, message.id);
        }
        const looking = this.viewingChatId === message.chatId && document.visibilityState === 'visible';
        if (!this.chats.applyMessage(message, !mine && !looking)) {
          void this.fetchChat(message.chatId);
        }
        if (this.chats.get(message.chatId)?.me.archivedAt) {
          void this.loadFolders();
        }
        if (looking && !mine) {
          this.markRead(message.chatId);
        }
        return;
      }
      case 'receipt': {
        const { chatId, ...receipts } = update.data;
        this.chats.applyReceipts(chatId, receipts);
        return;
      }
      case 'message.edited': {
        this.messages.replace(update.data.message);
        this.chats.applyChanged(update.data.message);
        return;
      }
      case 'message.deleted': {
        this.messages.replace(update.data.message);
        this.chats.applyChanged(update.data.message);
        return;
      }
      case 'message.hidden': {
        this.applyHidden(update.data.chatId, update.data.messageIds);
        return;
      }
      case 'chat.state': {
        const wasArchived = !!this.chats.get(update.data.chatId)?.me.archivedAt;
        this.applyState(update.data.chatId, update.data.me, update.data.unreadCount);
        if (live && (wasArchived || update.data.me.archivedAt)) {
          void this.loadFolders();
        }
        return;
      }
    }
  }

  /** Your state in a chat, from an acknowledgement or an update. Clearing drops the history. */
  private applyState(chatId: number, me: MyChatState, unreadCount: number) {
    const before = this.chats.get(chatId)?.me.clearedBeforeMessageId ?? 0;
    this.chats.applyState(chatId, me, unreadCount);
    if (me.clearedBeforeMessageId > before) {
      this.messages.clearUpTo(chatId, me.clearedBeforeMessageId);
    }
  }

  /** Messages deleted for me: off this device, and a hidden preview is fetched again. */
  private applyHidden(chatId: number, messageIds: number[]) {
    this.messages.remove(chatId, messageIds);
    const last = this.chats.get(chatId)?.lastMessage?.id;
    if (last !== undefined && messageIds.includes(last)) {
      void this.fetchChat(chatId, false);
    }
  }

  private async loadSettings() {
    const result = await this.socket.request<{ settings: Settings }>('settings.get');
    if (result.ok) {
      this.applySettings(result.settings);
    }
  }

  private applySettings({ readReceipts, ...notifications }: Settings) {
    this.readReceipts.set(readReceipts);
    this.notificationSettings.set(notifications);
  }

  /** Messages from others reached this device: say so, one request per chat per batch. */
  private queueDelivered(chatId: number, messageId: number) {
    this.deliveredQueue.set(chatId, Math.max(this.deliveredQueue.get(chatId) ?? 0, messageId));
    this.deliveredTimer ??= setTimeout(() => {
      this.deliveredTimer = undefined;
      const batch = [...this.deliveredQueue];
      this.deliveredQueue.clear();
      for (const [id, upTo] of batch) {
        void this.socket.request('chat.delivered', { chatId: id, upTo });
      }
    }, DELIVERED_BATCH_MS);
  }

  /** After a reload or reconnect: chats whose newest message from others isn't reported yet. */
  private reportUndelivered() {
    for (const chat of this.chats.chats()) {
      const last = chat.lastMessage;
      if (last && last.sender?.Id !== this.me?.Id && last.id > chat.me.lastDeliveredMessageId) {
        this.queueDelivered(chat.id, last.id);
      }
    }
  }

  private setSeq(seq: number) {
    this.seq = seq;
    void this.db.setSeq(seq);
  }

  /** A chat this device didn't know about (for example, missed while offline). */
  private async fetchChat(chatId: number, fresh = true) {
    const result = await this.socket.request<{ chat: Chat }>('chat.get', { chatId });
    if (result.ok) {
      this.chats.upsert([result.chat], { fresh });
      this.outboxFollows(result.chat);
    }
  }

  /** Re-requests the open chat's newest page (and rejoins its channel after a reconnect). */
  private async refreshOpenChat() {
    const chatId = this.viewingChatId;
    if (chatId === undefined || this.connection() === 'offline') {
      return;
    }
    const page = await this.socket.request<{ messages: ChatMessage[]; hasMore: boolean }>(
      'chat.open',
      { chatId },
    );
    if (page.ok && this.viewingChatId === chatId) {
      this.messages.applyLatest(chatId, page.messages, page.hasMore);
      if (document.visibilityState === 'visible') {
        this.markRead(chatId);
      }
    }
  }

  // ---- Outbox --------------------------------------------------------------------------------

  /** Sends queued messages one at a time, oldest first, so they're stored in order. */
  private async flushOutbox() {
    if (this.flushing || this.catchingUp || !this.socket.ioSocket.connected) {
      return;
    }
    this.flushing = true;
    clearTimeout(this.retryTimer);
    try {
      for (;;) {
        const entry = this.outbox.next();
        if (!entry || !this.me) {
          return;
        }
        const result = await this.socket.request<{ message: ChatMessage; chatId: number }>(
          'message.send',
          entry,
        );
        if (!result.ok && result.error === 'offline') {
          this.retryTimer = setTimeout(() => void this.flushOutbox(), RETRY_MS);
          return;
        }
        if (!result.ok) {
          // Refused (blocked, removed, too long…): it stays, marked failed, for Retry or Delete.
          this.outbox.fail(entry.clientMessageId, result.error);
          continue;
        }
        this.outbox.remove(entry.clientMessageId);
        if (entry.toUserId !== undefined) {
          this.outbox.attachToChat(entry.toUserId, result.chatId);
          if (!this.chats.get(result.chatId)) {
            await this.fetchChat(result.chatId);
          }
        }
        this.messages.add(result.message);
        this.chats.applyMessage(result.message, false);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Once a draft's chat exists, queued messages to that person go to the chat. */
  private outboxFollows(chat: Chat) {
    const target = chat.kind === 'self' ? this.me : chat.kind === 'direct' ? chat.members.find((m) => m.Id !== this.me?.Id) : undefined;
    if (target?.Id !== undefined) {
      this.outbox.attachToChat(target.Id, chat.id);
    }
  }


  private onUserUpdated(user: IUser) {
    if (user.Id === this.me?.Id) {
      this.me = { ...this.me, ...user };
    }
    this.chats.applyUser(user);
    this.messages.applyUser(user);
    this.userUpdated.next(user);
  }

  private reportFailure(error: string, fallback: string) {
    this.notices.next({
      kind: 'error',
      text: error === 'offline' ? `${fallback} You're offline; try again when you're back.` : error,
    });
  }
}
