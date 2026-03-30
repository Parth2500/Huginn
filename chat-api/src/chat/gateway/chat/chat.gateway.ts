import { Inject, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  AuthenticationToken,
  IAuthenticationService,
} from 'src/authentication/services/iservices/authentication.service.interface';
import { IConnectedUser } from 'src/chat/entities/connected-user/connected-user.interface';
import { IJoinedRoom } from 'src/chat/entities/joined-room/joined-room.interface';
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

@WebSocketGateway({ cors: { origin: ['http://localhost:4200'] } })
export class ChatGateway
  implements OnGatewayConnection, OnModuleInit, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  array: string[] = [];

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
      const decodedToken = await this.authService.validateJwt(
        socket.handshake.headers.authorization,
      );
      const user: IUser = await this.userService.findByIdPromise(
        decodedToken?.user?.Id,
      );

      if (!user) {
        return this.disconnect(socket);
      } else {
        socket.data.user = user;
        const rooms = await this.roomService.getRoomsForUser(user.Id, {
          page: 1,
          limit: 10,
        });
        rooms.meta.currentPage = rooms.meta.currentPage - 1;
        await this.connectedUserService.create({ socketId: socket.id, user });
        return this.server.to(socket.id).emit('rooms', rooms);
      }
    } catch (error) {
      return this.disconnect(socket);
    }
  }

  @SubscribeMessage('createRoom')
  async onCreateRoom(socket: Socket, room: IRoom) {
    const createdRoom: IRoom = await this.roomService.createRoom(
      room,
      socket.data.user,
    );

    for (const user of createdRoom.users) {
      const connections: IConnectedUser[] =
        await this.connectedUserService.findByUser(user);
      const rooms = await this.roomService.getRoomsForUser(user.Id, {
        page: 1,
        limit: 10,
      });
      rooms.meta.currentPage = rooms.meta.currentPage - 1;
      for (const connection of connections) {
        await this.server.to(connection.socketId).emit('rooms', rooms);
      }
    }
  }

  @SubscribeMessage('paginateRooms')
  async onPaginateRoom(socket: Socket, page: IPage) {
    const rooms = await this.roomService.getRoomsForUser(
      socket.data.user.Id,
      this.handleIncomingPageRequest(page),
    );
    rooms.meta.currentPage = rooms.meta.currentPage - 1;
    return this.server.to(socket.id).emit('rooms', rooms);
  }

  @SubscribeMessage('joinRoom')
  async onJoinRoom(socket: Socket, room: IRoom) {
    const messages = await this.messageService.findMessagesForRoom(room, {
      limit: 10,
      page: 1,
    });
    messages.meta.currentPage = messages.meta.currentPage - 1;
    await this.joinedRoomService.create({
      socketId: socket.id,
      user: socket.data.user,
      room,
    });
    await this.server.to(socket.id).emit('messages', messages);
  }

  @SubscribeMessage('leaveRoom')
  async onLeaveRoom(socket: Socket) {
    // remove connection from JoinedRooms
    await this.joinedRoomService.deleteBySocketId(socket.id);
  }

  @SubscribeMessage('addMessage')
  async onAddMessage(socket: Socket, message: IMessage) {
    const createdMessage: IMessage = await this.messageService.create({
      ...message,
      user: socket.data.user,
    });
    const room: IRoom = await this.roomService.getRoom(createdMessage.room.id);
    const joinedUsers: IJoinedRoom[] = await this.joinedRoomService.findByRoom(
      room,
    );
    // TODO: Send new Message to all joined Users of the room (currently online)
    for (const user of joinedUsers) {
      await this.server.to(user.socketId).emit('messageAdded', createdMessage);
    }
  }

  private handleIncomingPageRequest(page: IPage) {
    page.limit = page.limit > 100 ? 100 : page.limit;
    // add page +1 to match angular material paginator
    page.page = page.page + 1;
    return page;
  }

  async handleDisconnect(socket: Socket) {
    await this.connectedUserService.deleteBySocketId(socket.id);
    socket.disconnect();
  }

  private disconnect(socket: Socket) {
    socket.emit('error', new UnauthorizedException());
    socket.disconnect();
  }
}
