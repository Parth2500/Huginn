import { Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Pagination } from 'src/common/pagination';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import {
  AuthenticationToken,
  IAuthenticationService,
} from 'src/authentication/services/iservices/authentication.service.interface';
import { IMessage } from 'src/chat/entities/message/message.interface';
import { IPage } from 'src/chat/entities/page.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';
import {
  ConnectedUserToken,
  IConnectedUserService,
} from 'src/chat/services/iservices/connected-user.service.interface';
import {
  IJoinedRoomService,
  JoinedRoomToken,
} from 'src/chat/services/iservices/joined-room.service.interface';
import {
  IMessageService,
  MessageToken,
} from 'src/chat/services/iservices/message.service.interface';
import {
  IRoomService,
  RoomToken,
} from 'src/chat/services/iservices/room.service.interface';
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

const ROOMS_PAGE_SIZE = 10;
const MESSAGES_PAGE_SIZE = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_ROOM_NAME_LENGTH = 60;
const MAX_ROOM_DESCRIPTION_LENGTH = 140;

/** Socket.IO room per user (all their tabs) and per open chat. */
const userChannel = (userId: number) => `user:${userId}`;
const chatChannel = (roomId: number) => `chat:${roomId}`;

/**
 * Real-time chat. Delivery uses Socket.IO rooms rather than database lookups of socket ids,
 * so it needs no query per recipient and scales out across servers with the Redis adapter
 * (see docs/SCALING.md). Presence and profile changes go only to people who share a chat.
 */
@WebSocketGateway({ cors: { origin: ['http://localhost:4200'] } })
export class ChatGateway
  implements
    OnGatewayConnection,
    OnModuleInit,
    OnModuleDestroy,
    OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  /** Per-socket send queue, so one sender's messages are stored in the order they were sent. */
  private readonly sendQueues = new Map<string, Promise<void>>();
  private profileUpdates: Subscription;

  constructor(
    @Inject(AuthenticationToken) private authService: IAuthenticationService,
    @Inject(UserToken) private userService: IUserService,
    @Inject(ConnectedUserToken)
    private connectedUserService: IConnectedUserService,
    @Inject(JoinedRoomToken) private joinedRoomService: IJoinedRoomService,
    @Inject(MessageToken) private messageService: IMessageService,
    @Inject(RoomToken) private roomService: IRoomService,
    private userEvents: UserEventsService,
  ) {}

  async onModuleInit() {
    // Legacy socket registries from before Socket.IO rooms; cleared so stale rows never linger.
    await this.connectedUserService.deleteAll();
    await this.joinedRoomService.deleteAll();
    this.profileUpdates = this.userEvents.profileUpdated.subscribe(
      (user) => void this.onProfileUpdated(user),
    );
  }

  onModuleDestroy() {
    this.profileUpdates?.unsubscribe();
  }

  async handleConnection(socket: Socket) {
    try {
      // Accept both a raw token and "Bearer <token>".
      const header = socket.handshake.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : header;
      const decodedToken = (await this.authService.validateJwt(token)) as {
        user?: IUser;
      };
      const user: IUser = await this.userService.findByIdPromise(
        decodedToken?.user?.Id,
      );

      if (!user) {
        return this.disconnect(socket);
      }

      socket.data.user = user;
      const wasOnline = await this.isOnline(user.Id);
      void socket.join(userChannel(user.Id));

      const contacts = await this.roomService.findContactIds(user.Id);
      socket.emit('onlineUsers', await this.onlineAmong(contacts));
      if (!wasOnline) {
        this.toUsers(contacts).emit('presence', {
          userId: user.Id,
          online: true,
        });
      }
      socket.emit(
        'rooms',
        await this.roomsPage(user, { page: 1, limit: ROOMS_PAGE_SIZE }),
      );
    } catch {
      return this.disconnect(socket);
    }
  }

  async handleDisconnect(socket: Socket) {
    const user = this.userOf(socket);
    this.sendQueues.delete(socket.id);
    if (user && !(await this.isOnline(user.Id))) {
      const contacts = await this.roomService.findContactIds(user.Id);
      this.toUsers(contacts).emit('presence', {
        userId: user.Id,
        online: false,
      });
    }
  }

  @SubscribeMessage('createRoom')
  async onCreateRoom(socket: Socket, room: IRoom) {
    const user = this.userOf(socket);
    const name = typeof room?.name === 'string' ? room.name.trim() : '';
    const invited = Array.isArray(room?.users) ? room.users : [];
    const others = invited.filter(
      (u) => Number.isInteger(u?.Id) && u.Id !== user?.Id,
    );
    if (
      !user ||
      !name ||
      name.length > MAX_ROOM_NAME_LENGTH ||
      others.length < 2
    ) {
      return this.fail(
        socket,
        'A group needs a name of up to 60 characters and at least two other people. To talk to one person, search for them and send a message.',
      );
    }

    const description =
      typeof room.description === 'string'
        ? room.description.trim().slice(0, MAX_ROOM_DESCRIPTION_LENGTH) || null
        : null;
    const createdRoom: IRoom = await this.roomService.createRoom(
      { name, description, users: others.map((u) => ({ Id: u.Id })) },
      user,
    );
    const fullRoom = await this.roomService.getRoom(createdRoom.id);

    // Tell the creator which group was made, then refresh every member's list.
    socket.emit('roomCreated', this.publicRoom(fullRoom));
    await this.refreshRoomsFor(fullRoom.users);
    await this.sharePresence(fullRoom.users);
  }

  @SubscribeMessage('paginateRooms')
  async onPaginateRoom(socket: Socket, page: IPage) {
    const user = this.userOf(socket);
    if (!user) {
      return;
    }
    socket.emit(
      'rooms',
      await this.roomsPage(user, this.handleIncomingPageRequest(page)),
    );
  }

  @SubscribeMessage('joinRoom')
  async onJoinRoom(socket: Socket, room: IRoom) {
    const user = this.userOf(socket);
    if (!user || !(await this.isMember(room?.id, user))) {
      return this.fail(socket, "You're not a member of that chat.");
    }
    this.openChat(socket, room.id);
    const messages = await this.messageService.findMessagesForRoom(
      { id: room.id },
      { limit: MESSAGES_PAGE_SIZE, page: 1 },
    );
    socket.emit('messages', this.messagesPayload(room.id, messages));
  }

  @SubscribeMessage('loadOlderMessages')
  async onLoadOlderMessages(
    socket: Socket,
    request: { roomId: number; page: number },
  ) {
    const user = this.userOf(socket);
    if (!user || !(await this.isMember(request?.roomId, user))) {
      return this.fail(socket, "You're not a member of that chat.");
    }
    const page = Math.max(0, Math.floor(Number(request.page) || 0));
    const messages = await this.messageService.findMessagesForRoom(
      { id: request.roomId },
      { limit: MESSAGES_PAGE_SIZE, page: page + 1 },
    );
    socket.emit(
      'olderMessages',
      this.messagesPayload(request.roomId, messages),
    );
  }

  @SubscribeMessage('leaveRoom')
  onLeaveRoom(socket: Socket) {
    this.closeChats(socket);
  }

  @SubscribeMessage('typing')
  onTyping(socket: Socket, request: { roomId: number }) {
    const user = this.userOf(socket);
    // Only someone who has the chat open (and so passed the membership check) can type into it.
    if (
      !user ||
      !Number.isInteger(request?.roomId) ||
      !socket.rooms.has(chatChannel(request.roomId))
    ) {
      return;
    }
    socket
      .to(chatChannel(request.roomId))
      .except(userChannel(user.Id))
      .emit('typing', {
        roomId: request.roomId,
        user: {
          Id: user.Id,
          username: user.username,
          displayName: user.displayName ?? null,
        },
      });
  }

  /** Opening a chat with someone: returns the existing direct chat, or none yet (a draft). */
  @SubscribeMessage('openDirect')
  async onOpenDirect(socket: Socket, request: { userId: number }) {
    const user = this.userOf(socket);
    const partner = await this.directPartner(user, request?.userId);
    if (!user || !partner) {
      return this.fail(socket, "That person couldn't be found.");
    }
    const room = await this.roomService.findDirect(user.Id, partner.Id);
    socket.emit('directOpened', {
      partner: {
        ...toPublicUser(partner),
        online: await this.isOnline(partner.Id),
      },
      room: room ? this.publicRoom(room) : null,
    });
  }

  /** First and later messages to a person. The chat is created by the first message only. */
  @SubscribeMessage('sendDirectMessage')
  onSendDirectMessage(
    socket: Socket,
    request: { userId: number; text: string },
  ) {
    return this.enqueue(socket, () => this.sendDirect(socket, request));
  }

  @SubscribeMessage('addMessage')
  onAddMessage(socket: Socket, message: IMessage) {
    return this.enqueue(socket, () => this.addMessage(socket, message));
  }

  private enqueue(socket: Socket, task: () => Promise<unknown>) {
    const previous = this.sendQueues.get(socket.id) ?? Promise.resolve();
    const next: Promise<void> = previous.then(task).then(
      () => undefined,
      (error: unknown) => {
        this.logger.error(
          `send failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        this.fail(
          socket,
          "Your message couldn't be saved. Try sending it again.",
        );
      },
    );
    this.sendQueues.set(socket.id, next);
    return next;
  }

  private async sendDirect(
    socket: Socket,
    request: { userId: number; text: string },
  ) {
    const user = this.userOf(socket);
    const text = this.cleanText(request?.text);
    if (!user || !text) {
      return this.fail(
        socket,
        'Messages must be between 1 and 2000 characters.',
      );
    }
    const partner = await this.directPartner(user, request?.userId);
    if (!partner) {
      return this.fail(socket, "That person couldn't be found.");
    }

    // Direct sends come from a draft on the client. The chat may already exist if the other person
    // wrote first, so always open it on this socket and tell the sender its id.
    const existed = !!(await this.roomService.findDirect(user.Id, partner.Id));
    const room = await this.roomService.findOrCreateDirect(user.Id, partner.Id);
    this.openChat(socket, room.id);
    socket.emit('directRoomCreated', {
      room: this.publicRoom(room),
      partnerId: partner.Id,
    });
    await this.storeAndBroadcast(user, room.id, text);
    if (!existed) {
      // They are contacts now: let each see the other's presence.
      await this.sharePresence(room.users);
    }
  }

  private async addMessage(socket: Socket, message: IMessage) {
    const user = this.userOf(socket);
    const text = this.cleanText(message?.text);
    const roomId = message?.room?.id;
    if (!user || !text) {
      return this.fail(
        socket,
        'Messages must be between 1 and 2000 characters.',
      );
    }
    if (!(await this.isMember(roomId, user))) {
      return this.fail(socket, "You're not a member of that chat.");
    }
    await this.storeAndBroadcast(user, roomId, text);
  }

  private async storeAndBroadcast(user: IUser, roomId: number, text: string) {
    const createdMessage: IMessage = await this.messageService.create({
      text,
      room: { id: roomId },
      user,
    } as IMessage);
    await this.roomService.touch(roomId);
    const room: IRoom = await this.roomService.getRoom(roomId);
    const outgoing = {
      ...createdMessage,
      user: toPublicUser(user) as IUser,
      room: this.publicRoom(room),
    };

    // Everyone with the chat open gets the message itself...
    this.server.to(chatChannel(roomId)).emit('messageAdded', outgoing);
    // ...and every member's tabs get a light activity ping for their chat list.
    const activity = { roomId, message: { ...outgoing, room: { id: roomId } } };
    this.toUsers(room.users.map((u) => u.Id)).emit('roomActivity', activity);
  }

  /** Someone changed their name, photo or bio: tell the people who can see them. */
  private async onProfileUpdated(user: IPublicUser) {
    // Sockets cache their user at connect; keep the cache current so new messages carry the change.
    for (const socket of await this.server
      .in(userChannel(user.Id))
      .fetchSockets()) {
      socket.data.user = { ...socket.data.user, ...user };
    }
    const contacts = await this.roomService.findContactIds(user.Id);
    this.toUsers([...contacts, user.Id]).emit('userUpdated', user);
  }

  private openChat(socket: Socket, roomId: number) {
    this.closeChats(socket);
    void socket.join(chatChannel(roomId));
  }

  private closeChats(socket: Socket) {
    for (const channel of socket.rooms) {
      if (channel.startsWith('chat:')) {
        void socket.leave(channel);
      }
    }
  }

  /**
   * Emit to every tab of these users. An empty list must emit to nobody: `server.to([])` would
   * broadcast to every connected socket.
   */
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
  private async sharePresence(users: IUser[]) {
    const ids = users.map((u) => u.Id);
    const online = await this.onlineAmong(ids);
    for (const id of ids) {
      this.server.to(userChannel(id)).emit(
        'presenceBatch',
        online.filter((o) => o !== id),
      );
    }
  }

  private cleanText(value: unknown): string | null {
    const text = typeof value === 'string' ? value.trim() : '';
    return text && text.length <= MAX_MESSAGE_LENGTH ? text : null;
  }

  private async directPartner(
    user: IUser | undefined,
    userId: unknown,
  ): Promise<IUser | null> {
    if (!user || !Number.isInteger(userId) || userId === user.Id) {
      return null;
    }
    return (await this.userService.findByIdPromise(userId as number)) ?? null;
  }

  private async roomsPage(
    user: IUser,
    options: IPage,
  ): Promise<Pagination<IRoom>> {
    const rooms = await this.roomService.getRoomsForUser(user.Id, options);
    const latest = await this.messageService.findLatestForRooms(
      rooms.items.map((r) => r.id),
    );
    const items = rooms.items.map((room) => ({
      ...this.publicRoom(room),
      lastMessage: this.publicMessage(latest.get(room.id)),
    }));
    // Pages are zero-based on the client.
    return new Pagination(items, {
      ...rooms.meta,
      currentPage: rooms.meta.currentPage - 1,
    });
  }

  private async refreshRoomsFor(users: IUser[]) {
    for (const member of users) {
      const rooms = await this.roomsPage(member, {
        page: 1,
        limit: ROOMS_PAGE_SIZE,
      });
      this.server.to(userChannel(member.Id)).emit('rooms', rooms);
    }
  }

  /** Rooms as clients see them: public member profiles, no internal keys. */
  private publicRoom(room: IRoom): IRoom {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { directKey, ...rest } = room;
    return {
      ...rest,
      users: (room.users ?? []).map((u) => toPublicUser(u) as IUser),
    };
  }

  private publicMessage(message: IMessage | undefined): IMessage | null {
    return message
      ? {
          ...message,
          user: message.user && toPublicUser(message.user),
        }
      : null;
  }

  private messagesPayload(roomId: number, messages: Pagination<IMessage>) {
    return {
      roomId,
      items: messages.items.map((m) => this.publicMessage(m)),
      meta: { ...messages.meta, currentPage: messages.meta.currentPage - 1 },
    };
  }

  private async isMember(roomId: unknown, user: IUser): Promise<boolean> {
    return (
      Number.isInteger(roomId) &&
      this.roomService.isMember(roomId as number, user.Id)
    );
  }

  private userOf(socket: Socket): IUser | undefined {
    return socket.data?.user;
  }

  private fail(socket: Socket, message: string) {
    socket.emit('chatError', { message });
  }

  private handleIncomingPageRequest(page: IPage): IPage {
    const limit = Math.min(
      Math.max(1, Number(page?.limit) || ROOMS_PAGE_SIZE),
      100,
    );
    // The client pages from 0; the services page from 1.
    return { limit, page: Math.max(0, Number(page?.page) || 0) + 1 };
  }

  private disconnect(socket: Socket) {
    this.logger.warn(`Rejected socket ${socket.id}: missing or invalid token`);
    socket.emit('unauthorized', {
      message: 'Your session has ended. Sign in again.',
    });
    socket.disconnect();
  }
}
