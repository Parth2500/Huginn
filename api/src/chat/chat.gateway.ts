import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import {
  appOrigins,
  isForeignOrigin,
  readSessionToken,
} from 'src/auth/session-cookie';
import { SessionsService } from 'src/auth/sessions.service';
import {
  IPublicUser,
  IUser,
  toPublicUser,
} from 'src/user/entities/user.interface';
import { UserEventsService } from 'src/user/services/user-events.service';
import {
  IUserService,
  UserToken,
} from 'src/user/services/iservices/user.service.interface';
import {
  Ack,
  ChatFolder,
  ChatStateChange,
  MuteFor,
  PROTOCOL_VERSION,
} from './chat.types';
import { ChatRuleError, ChatsService } from './chats.service';
import { MessagesService } from './messages.service';
import { Addressed, UpdatesService } from './updates.service';

/** Socket.IO room per user (all their tabs) and per open chat. */
const userChannel = (userId: number) => `user:${userId}`;
const chatChannel = (chatId: number) => `chat:${chatId}`;
/** Every socket signed in with one session, so signing out disconnects them all. */
const sessionChannel = (sessionId: string) => `session:${sessionId}`;

/**
 * Realtime protocol v1 (docs/huginn/architecture.md §4–5).
 *
 * - Requests are acknowledged: every handler returns `{ ok: true, ... }` or `{ ok: false, error }`.
 * - Durable changes reach each person as `update { seq, type, data }`, recorded in their update
 *   log first, so a device that was away catches up with `sync { sinceSeq }`.
 * - Typing and presence are ephemeral and never replayed.
 */
@WebSocketGateway({ cors: { origin: appOrigins(), credentials: true } })
export class ChatGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  /** Per-socket send queue, so one sender's messages are stored in the order they were sent. */
  private readonly sendQueues = new Map<string, Promise<unknown>>();
  private subscriptions: Subscription[] = [];

  constructor(
    private readonly sessions: SessionsService,
    @Inject(UserToken) private readonly userService: IUserService,
    private readonly chats: ChatsService,
    private readonly messages: MessagesService,
    private readonly updates: UpdatesService,
    private readonly userEvents: UserEventsService,
  ) {}

  onModuleInit() {
    this.subscriptions.push(
      this.userEvents.profileUpdated.subscribe(
        (user) => void this.onProfileUpdated(user),
      ),
      this.sessions.ended.subscribe((sessionId) => this.endSession(sessionId)),
    );
  }

  onModuleDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe());
  }

  async handleConnection(socket: Socket) {
    try {
      const headers = socket.handshake.headers;
      if (isForeignOrigin(headers)) {
        return this.reject(socket, 'it came from another site');
      }
      const resolved = await this.sessions.resolve(
        readSessionToken(headers.cookie),
      );
      if (!resolved) {
        return this.reject(socket, 'no valid session');
      }
      const { user, session } = resolved;
      socket.data.user = user;
      await socket.join(sessionChannel(session.id));
      const wasOnline = await this.isOnline(user.Id);
      await socket.join(userChannel(user.Id));

      const contacts = await this.chats.contactIds(user.Id);
      socket.emit('onlineUsers', await this.onlineAmong(contacts));
      if (!wasOnline) {
        this.toUsers(contacts).emit('presence', {
          userId: user.Id,
          online: true,
        });
      }
      socket.emit('hello', {
        protocol: PROTOCOL_VERSION,
        seq: await this.updates.currentSeq(user.Id),
      });
    } catch {
      return this.reject(socket);
    }
  }

  async handleDisconnect(socket: Socket) {
    const user = this.userOf(socket);
    this.sendQueues.delete(socket.id);
    try {
      if (user && !(await this.isOnline(user.Id))) {
        const contacts = await this.chats.contactIds(user.Id);
        this.toUsers(contacts).emit('presence', {
          userId: user.Id,
          online: false,
        });
      }
    } catch (error) {
      // Shutting down closes the database before the last sockets; nobody is left to tell.
      this.logger.debug(
        `Presence on disconnect skipped: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    }
  }

  /** Updates since the device's last applied sequence number. */
  @SubscribeMessage('sync')
  onSync(socket: Socket, request: { sinceSeq?: number }) {
    return this.handle(socket, async (user) => {
      const sinceSeq = Math.max(0, Math.floor(Number(request?.sinceSeq) || 0));
      return this.updates.since(user.Id, sinceSeq);
    });
  }

  @SubscribeMessage('chats.list')
  onChatsList(
    socket: Socket,
    request: {
      before?: { lastActivityAt: string; id: number };
      folder?: ChatFolder;
    },
  ) {
    return this.handle(socket, (user) =>
      this.chats.list(
        user.Id,
        request?.before,
        request?.folder === 'archived' ? 'archived' : 'main',
      ),
    );
  }

  /** The folder rows above the list: Archived (and, later, Message requests). */
  @SubscribeMessage('chats.folders')
  onChatsFolders(socket: Socket) {
    return this.handle(socket, (user) => this.chats.folders(user.Id));
  }

  /** Pin, archive, mute, mark read or unread, clear or delete: one change for one or more chats. */
  @SubscribeMessage('chat.state')
  onChatState(
    socket: Socket,
    request: { chatIds?: unknown } & Record<string, unknown>,
  ) {
    return this.handle(socket, async (user) => {
      const chatIds = Array.isArray(request?.chatIds)
        ? [...new Set(request.chatIds.map(Number))].filter(Number.isInteger)
        : [];
      if (chatIds.length === 0 || chatIds.length > 100) {
        throw new ChatRuleError('Choose between 1 and 100 chats.');
      }
      const change = parseStateChange(request);
      if (!change) {
        throw new ChatRuleError(
          'Say what to change: pin, archive, mute, unread, clear or delete.',
        );
      }
      const { chats, updates } = await this.chats.changeState(
        user.Id,
        chatIds,
        change,
      );
      this.publish(updates);
      return {
        results: chats.map((c) => ({
          chatId: c.id,
          me: c.me,
          unreadCount: c.unreadCount,
        })),
      };
    });
  }

  /** A new order for your pinned chats: every pinned chat id, first to last. */
  @SubscribeMessage('chat.pins')
  onChatPins(socket: Socket, request: { chatIds?: unknown }) {
    return this.handle(socket, async (user) => {
      const chatIds = Array.isArray(request?.chatIds)
        ? request.chatIds.map(Number)
        : [];
      if (
        !chatIds.every(Number.isInteger) ||
        new Set(chatIds).size !== chatIds.length
      ) {
        throw new ChatRuleError('List each pinned chat once.');
      }
      const { chats, updates } = await this.chats.reorderPins(user.Id, chatIds);
      this.publish(updates);
      return {
        results: chats.map((c) => ({
          chatId: c.id,
          me: c.me,
          unreadCount: c.unreadCount,
        })),
      };
    });
  }

  @SubscribeMessage('chat.get')
  onChatGet(socket: Socket, request: { chatId: number }) {
    return this.handle(socket, async (user) => {
      const chat = await this.chats.summary(user.Id, Number(request?.chatId));
      if (!chat) {
        throw new ChatRuleError("You're not a member of that chat.");
      }
      return { chat };
    });
  }

  /** Opening a chat with someone: their existing direct chat, or none yet (a draft). */
  @SubscribeMessage('direct.open')
  onDirectOpen(socket: Socket, request: { userId: number }) {
    return this.handle(socket, async (user) => {
      const otherId = Number(request?.userId);
      const other =
        Number.isInteger(otherId) && otherId !== user.Id
          ? await this.userService.findByIdPromise(otherId)
          : null;
      if (!other) {
        throw new ChatRuleError("That person couldn't be found.");
      }
      const direct = await this.chats.findDirect(user.Id, other.Id);
      return {
        partner: {
          ...toPublicUser(other),
          online: await this.isOnline(other.Id),
        },
        chat: direct ? await this.chats.summary(user.Id, direct.id) : null,
      };
    });
  }

  /** Opens a chat on this socket (typing goes to open chats) and returns its latest messages. */
  @SubscribeMessage('chat.open')
  onChatOpen(socket: Socket, request: { chatId: number }) {
    return this.handle(socket, async (user) => {
      const chatId = Number(request?.chatId);
      if (!(await this.chats.isActiveMember(chatId, user.Id))) {
        throw new ChatRuleError("You're not a member of that chat.");
      }
      await this.openChannel(socket, chatId);
      return this.messages.page(chatId, user.Id);
    });
  }

  @SubscribeMessage('chat.close')
  onChatClose(socket: Socket) {
    return this.handle(socket, async () => {
      await this.closeChannels(socket);
      return {};
    });
  }

  @SubscribeMessage('messages.page')
  onMessagesPage(socket: Socket, request: { chatId: number; before?: number }) {
    return this.handle(socket, (user) =>
      this.messages.page(
        Number(request?.chatId),
        user.Id,
        Number(request?.before) || undefined,
      ),
    );
  }

  /**
   * Sends a message to a chat (`chatId`) or to a person (`toUserId`, which creates the direct chat
   * on the first message). Idempotent on `clientMessageId`, and ordered per socket.
   */
  @SubscribeMessage('message.send')
  onMessageSend(
    socket: Socket,
    request: {
      clientMessageId: string;
      text: string;
      chatId?: number;
      toUserId?: number;
    },
  ) {
    return this.handle(socket, (user) =>
      this.enqueue(socket, async () => {
        const result = await this.messages.send({
          senderId: user.Id,
          clientMessageId: request?.clientMessageId,
          text: request?.text,
          chatId:
            request?.chatId !== undefined ? Number(request.chatId) : undefined,
          toUserId:
            request?.toUserId !== undefined
              ? Number(request.toUserId)
              : undefined,
        });
        if (result.createdChat) {
          // The sender is looking at this chat already.
          await this.openChannel(socket, result.chatId);
        }
        this.publish(result.updates);
        return { message: result.message, chatId: result.chatId };
      }),
    );
  }

  @SubscribeMessage('chat.read')
  onChatRead(socket: Socket, request: { chatId: number; upTo: number }) {
    return this.handle(socket, async (user) => {
      const { updates } = await this.messages.markRead(
        Number(request?.chatId),
        user.Id,
        Math.max(0, Math.floor(Number(request?.upTo) || 0)),
      );
      this.publish(updates);
      return {};
    });
  }

  @SubscribeMessage('group.create')
  onGroupCreate(
    socket: Socket,
    request: { title: string; description?: string; memberIds: number[] },
  ) {
    return this.handle(socket, async (user) => {
      const { chat, memberIds, updates } = await this.chats.createGroup(
        user.Id,
        {
          title: request?.title,
          description: request?.description,
          memberIds: Array.isArray(request?.memberIds)
            ? request.memberIds.map(Number)
            : [],
        },
      );
      this.publish(updates);
      await this.sharePresence(memberIds);
      return { chat };
    });
  }

  @SubscribeMessage('typing')
  onTyping(socket: Socket, request: { chatId: number }) {
    const user = this.userOf(socket);
    const chatId = Number(request?.chatId);
    // Only a socket that opened the chat (and so passed the membership check) can type into it.
    if (!user || !socket.rooms.has(chatChannel(chatId))) {
      return;
    }
    socket
      .to(chatChannel(chatId))
      .except(userChannel(user.Id))
      .emit('typing', {
        chatId,
        user: {
          Id: user.Id,
          username: user.username,
          displayName: user.displayName ?? null,
        },
      });
  }

  /** Runs a request handler and turns its result into an acknowledgement. */
  private async handle<T extends object>(
    socket: Socket,
    run: (user: IUser) => Promise<T>,
  ): Promise<Ack<T>> {
    const user = this.userOf(socket);
    if (!user) {
      return { ok: false, error: 'Your session has ended. Sign in again.' };
    }
    try {
      return { ok: true, ...(await run(user)) };
    } catch (error) {
      if (error instanceof ChatRuleError) {
        return { ok: false, error: error.message };
      }
      this.logger.error(
        error instanceof Error ? error.stack : JSON.stringify(error),
      );
      return { ok: false, error: 'Something went wrong. Try again.' };
    }
  }

  private enqueue<T>(socket: Socket, task: () => Promise<T>): Promise<T> {
    const previous = this.sendQueues.get(socket.id) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.sendQueues.set(
      socket.id,
      next.catch(() => undefined),
    );
    return next;
  }

  /** Pushes committed updates to each recipient's devices. */
  private publish(updates: Addressed[]) {
    for (const { userId, update } of updates) {
      this.server.to(userChannel(userId)).emit('update', update);
    }
  }

  /** Someone changed their name, photo or bio: tell the people who can see them. */
  private async onProfileUpdated(user: IPublicUser) {
    for (const socket of await this.server
      .in(userChannel(user.Id))
      .fetchSockets()) {
      socket.data.user = { ...socket.data.user, ...user };
    }
    const contacts = await this.chats.contactIds(user.Id);
    this.toUsers([...contacts, user.Id]).emit('userUpdated', user);
  }

  private async openChannel(socket: Socket, chatId: number) {
    await this.closeChannels(socket);
    await socket.join(chatChannel(chatId));
  }

  private async closeChannels(socket: Socket) {
    for (const channel of socket.rooms) {
      if (channel.startsWith('chat:')) {
        await socket.leave(channel);
      }
    }
  }

  /** Every tab of these users. An empty list emits to nobody (`server.to([])` would broadcast). */
  private toUsers(userIds: number[]): {
    emit: (event: string, ...args: unknown[]) => void;
  } {
    if (userIds.length === 0) {
      return { emit: () => undefined };
    }
    return this.server.to(userIds.map(userChannel));
  }

  private async isOnline(userId: number): Promise<boolean> {
    return (
      (await this.server.in(userChannel(userId)).fetchSockets()).length > 0
    );
  }

  private async onlineAmong(userIds: number[]): Promise<number[]> {
    const online: number[] = [];
    for (const id of userIds) {
      if (await this.isOnline(id)) {
        online.push(id);
      }
    }
    return online;
  }

  /** New contacts (a new chat or group): send each member which of the others are online. */
  private async sharePresence(userIds: number[]) {
    const online = await this.onlineAmong(userIds);
    for (const id of userIds) {
      this.server.to(userChannel(id)).emit(
        'presenceBatch',
        online.filter((o) => o !== id),
      );
    }
  }

  private userOf(socket: Socket): IUser | undefined {
    return socket.data?.user as IUser | undefined;
  }

  /** Signed out (or the session was revoked): its sockets stop at once, in every tab. */
  private endSession(sessionId: string) {
    const channel = this.server?.to(sessionChannel(sessionId));
    channel?.emit('unauthorized', { message: 'You signed out.' });
    channel?.disconnectSockets(true);
  }

  private reject(socket: Socket, reason = 'no valid session') {
    this.logger.warn(`Rejected socket ${socket.id}: ${reason}`);
    socket.emit('unauthorized', {
      message: 'Your session has ended. Sign in again.',
    });
    socket.disconnect();
  }
}

/** Exactly one recognised change, with a valid value; anything else is refused. */
function parseStateChange(
  request: Record<string, unknown>,
): ChatStateChange | null {
  const keys = ['pin', 'archive', 'mute', 'unread', 'clear', 'delete'].filter(
    (k) => request?.[k] !== undefined,
  );
  if (keys.length !== 1) {
    return null;
  }
  const value = request[keys[0]];
  if (keys[0] === 'mute') {
    const mutes: MuteFor[] = ['8h', '1w', 'always', null];
    return mutes.includes(value as MuteFor) ? { mute: value as MuteFor } : null;
  }
  if (keys[0] === 'clear' || keys[0] === 'delete') {
    // There's no undoing either, so only `true` means anything.
    return value === true
      ? keys[0] === 'clear'
        ? { clear: true }
        : { delete: true }
      : null;
  }
  if (typeof value !== 'boolean') {
    return null;
  }
  return keys[0] === 'pin'
    ? { pin: value }
    : keys[0] === 'archive'
      ? { archive: value }
      : { unread: value };
}
