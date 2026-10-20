import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Pagination } from 'nestjs-typeorm-paginate';
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
import { IUser } from 'src/user/entities/user.interface';
import {
  IUserService,
  UserToken,
} from 'src/user/services/iservices/user.service.interface';

const ROOMS_PAGE_SIZE = 10;
const MESSAGES_PAGE_SIZE = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_ROOM_NAME_LENGTH = 60;
const MAX_ROOM_DESCRIPTION_LENGTH = 140;

@WebSocketGateway({ cors: { origin: ['http://localhost:4200'] } })
export class ChatGateway
  implements OnGatewayConnection, OnModuleInit, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  /** Per-socket send queue, so one sender's messages are stored in the order they were sent. */
  private readonly sendQueues = new Map<string, Promise<void>>();

  constructor(
    @Inject(AuthenticationToken) private authService: IAuthenticationService,
    @Inject(UserToken) private userService: IUserService,
    @Inject(ConnectedUserToken)
    private connectedUserService: IConnectedUserService,
    @Inject(JoinedRoomToken) private joinedRoomService: IJoinedRoomService,
    @Inject(MessageToken) private messageService: IMessageService,
    @Inject(RoomToken) private roomService: IRoomService,
  ) {}

  async onModuleInit() {
    await this.connectedUserService.deleteAll();
    await this.joinedRoomService.deleteAll();
  }

  async handleConnection(socket: Socket) {
    try {
      // Accept both a raw token and "Bearer <token>".
      const header = socket.handshake.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : header;
      const decodedToken = await this.authService.validateJwt(token);
      const user: IUser = await this.userService.findByIdPromise(
        decodedToken?.user?.Id,
      );

      if (!user) {
        return this.disconnect(socket);
      }

      socket.data.user = user;
      const wasOnline = (await this.connectedUserService.findByUser(user)).length > 0;
      await this.connectedUserService.create({ socketId: socket.id, user });

      this.server
        .to(socket.id)
        .emit('onlineUsers', await this.connectedUserService.findOnlineUserIds());
      if (!wasOnline) {
        this.server.emit('presence', { userId: user.Id, online: true });
      }
      return this.server
        .to(socket.id)
        .emit('rooms', await this.roomsPage(user, { page: 1, limit: ROOMS_PAGE_SIZE }));
    } catch (error) {
      return this.disconnect(socket);
    }
  }

  @SubscribeMessage('createRoom')
  async onCreateRoom(socket: Socket, room: IRoom) {
    const user = this.userOf(socket);
    const name = typeof room?.name === 'string' ? room.name.trim() : '';
    const invited = Array.isArray(room?.users) ? room.users : [];
    if (!user || !name || name.length > MAX_ROOM_NAME_LENGTH || invited.length === 0) {
      return this.fail(socket, 'A room needs a name of up to 60 characters and at least one other person.');
    }

    const description =
      typeof room.description === 'string'
        ? room.description.trim().slice(0, MAX_ROOM_DESCRIPTION_LENGTH) || null
        : null;
    const createdRoom: IRoom = await this.roomService.createRoom(
      {
        name,
        description,
        users: invited.filter((u) => Number.isInteger(u?.Id)).map((u) => ({ Id: u.Id })),
      },
      user,
    );
    const fullRoom = await this.roomService.getRoom(createdRoom.id);

    // Tell the creator which room was made, then refresh every member's list.
    this.server.to(socket.id).emit('roomCreated', fullRoom);
    await this.refreshRoomsFor(fullRoom.users);
  }

  @SubscribeMessage('paginateRooms')
  async onPaginateRoom(socket: Socket, page: IPage) {
    const user = this.userOf(socket);
    if (!user) {
      return;
    }
    return this.server
      .to(socket.id)
      .emit('rooms', await this.roomsPage(user, this.handleIncomingPageRequest(page)));
  }

  @SubscribeMessage('joinRoom')
  async onJoinRoom(socket: Socket, room: IRoom) {
    const user = this.userOf(socket);
    if (!user || !(await this.isMember(room?.id, user))) {
      return this.fail(socket, "You're not a member of that room.");
    }
    // One open room per socket.
    await this.joinedRoomService.deleteBySocketId(socket.id);
    await this.joinedRoomService.create({ socketId: socket.id, user, room: { id: room.id } });

    const messages = await this.messageService.findMessagesForRoom(
      { id: room.id },
      { limit: MESSAGES_PAGE_SIZE, page: 1 },
    );
    await this.server.to(socket.id).emit('messages', this.messagesPayload(room.id, messages));
  }

  @SubscribeMessage('loadOlderMessages')
  async onLoadOlderMessages(socket: Socket, request: { roomId: number; page: number }) {
    const user = this.userOf(socket);
    if (!user || !(await this.isMember(request?.roomId, user))) {
      return this.fail(socket, "You're not a member of that room.");
    }
    const page = Math.max(0, Math.floor(Number(request.page) || 0));
    const messages = await this.messageService.findMessagesForRoom(
      { id: request.roomId },
      { limit: MESSAGES_PAGE_SIZE, page: page + 1 },
    );
    await this.server
      .to(socket.id)
      .emit('olderMessages', this.messagesPayload(request.roomId, messages));
  }

  @SubscribeMessage('leaveRoom')
  async onLeaveRoom(socket: Socket) {
    await this.joinedRoomService.deleteBySocketId(socket.id);
  }

  @SubscribeMessage('typing')
  async onTyping(socket: Socket, request: { roomId: number }) {
    const user = this.userOf(socket);
    if (!user || !Number.isInteger(request?.roomId)) {
      return;
    }
    const joined = await this.joinedRoomService.findByRoom({ id: request.roomId });
    for (const entry of joined) {
      if (entry.socketId !== socket.id && entry.user?.Id !== user.Id) {
        this.server.to(entry.socketId).emit('typing', {
          roomId: request.roomId,
          user: { Id: user.Id, username: user.username },
        });
      }
    }
  }

  @SubscribeMessage('addMessage')
  onAddMessage(socket: Socket, message: IMessage) {
    const previous = this.sendQueues.get(socket.id) ?? Promise.resolve();
    const next = previous
      .then(() => this.addMessage(socket, message))
      .catch((error) => {
        this.logger.error(`addMessage failed: ${error?.message ?? error}`);
        this.fail(socket, "Your message couldn't be saved. Try sending it again.");
      });
    this.sendQueues.set(socket.id, next);
    return next;
  }

  private async addMessage(socket: Socket, message: IMessage) {
    const user = this.userOf(socket);
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    const roomId = message?.room?.id;
    if (!user || !text || text.length > MAX_MESSAGE_LENGTH) {
      return this.fail(socket, 'Messages must be between 1 and 2000 characters.');
    }
    if (!(await this.isMember(roomId, user))) {
      return this.fail(socket, "You're not a member of that room.");
    }

    const createdMessage: IMessage = await this.messageService.create({
      text,
      room: { id: roomId },
      user,
    } as IMessage);
    await this.roomService.touch(roomId);
    const room: IRoom = await this.roomService.getRoom(roomId);
    const outgoing = { ...createdMessage, user: this.publicUser(user), room };

    // Everyone with the room open gets the message itself...
    const joinedUsers = await this.joinedRoomService.findByRoom(room);
    for (const joined of joinedUsers) {
      await this.server.to(joined.socketId).emit('messageAdded', outgoing);
    }

    // ...and every member's sockets get a lightweight activity ping for their room list.
    const activity = { roomId, message: { ...outgoing, room: { id: roomId } } };
    for (const member of room.users) {
      const connections = await this.connectedUserService.findByUser(member);
      for (const connection of connections) {
        this.server.to(connection.socketId).emit('roomActivity', activity);
      }
    }
  }

  private async roomsPage(user: IUser, options: IPage): Promise<Pagination<IRoom>> {
    const rooms = await this.roomService.getRoomsForUser(user.Id, options);
    const latest = await this.messageService.findLatestForRooms(rooms.items.map((r) => r.id));
    for (const room of rooms.items) {
      room.lastMessage = latest.get(room.id) ?? null;
    }
    // Pages are zero-based on the client.
    rooms.meta.currentPage = rooms.meta.currentPage - 1;
    return rooms;
  }

  private async refreshRoomsFor(users: IUser[]) {
    for (const member of users) {
      const connections = await this.connectedUserService.findByUser(member);
      if (connections.length === 0) {
        continue;
      }
      const rooms = await this.roomsPage(member, { page: 1, limit: ROOMS_PAGE_SIZE });
      for (const connection of connections) {
        await this.server.to(connection.socketId).emit('rooms', rooms);
      }
    }
  }

  private messagesPayload(roomId: number, messages: Pagination<IMessage>) {
    return {
      roomId,
      items: messages.items,
      meta: { ...messages.meta, currentPage: messages.meta.currentPage - 1 },
    };
  }

  private async isMember(roomId: unknown, user: IUser): Promise<boolean> {
    return Number.isInteger(roomId) && this.roomService.isMember(roomId as number, user.Id);
  }

  private userOf(socket: Socket): IUser | undefined {
    return socket.data?.user;
  }

  private publicUser(user: IUser): IUser {
    return { Id: user.Id, username: user.username, email: user.email };
  }

  private fail(socket: Socket, message: string) {
    this.server.to(socket.id).emit('chatError', { message });
  }

  private handleIncomingPageRequest(page: IPage): IPage {
    const limit = Math.min(Math.max(1, Number(page?.limit) || ROOMS_PAGE_SIZE), 100);
    // The client pages from 0; nestjs-typeorm-paginate pages from 1.
    return { limit, page: Math.max(0, Number(page?.page) || 0) + 1 };
  }

  async handleDisconnect(socket: Socket) {
    const user = this.userOf(socket);
    this.sendQueues.delete(socket.id);
    await this.joinedRoomService.deleteBySocketId(socket.id);
    await this.connectedUserService.deleteBySocketId(socket.id);
    if (user && (await this.connectedUserService.findByUser(user)).length === 0) {
      this.server.emit('presence', { userId: user.Id, online: false });
    }
    socket.disconnect();
  }

  private disconnect(socket: Socket) {
    this.logger.warn(`Rejected socket ${socket.id}: missing or invalid token`);
    socket.emit('unauthorized', { message: 'Your session has ended. Sign in again.' });
    socket.disconnect();
  }
}
