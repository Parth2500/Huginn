import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getAccessToken } from 'src/app/app.module';
import {
  IMessage,
  IMessagePaginate,
  IRoomActivity,
  ITyping,
} from 'src/app/models/message.interface';
import {
  IDirectOpened,
  IDirectRoomCreated,
  IRoom,
  IRoomPaginate,
} from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import { CustomSocketService } from './custom-socket.service';
import { ConnectionState, IChatService } from './iservices/chat.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ChatService implements IChatService {
  private readonly connectionState = new BehaviorSubject<ConnectionState>('connecting');
  private readonly onlineUserIds = new BehaviorSubject<Set<number>>(new Set());

  constructor(private socket: CustomSocketService) {
    this.socket.on('connect', () => this.connectionState.next('online'));
    this.socket.on('disconnect', () => this.connectionState.next('offline'));
    this.socket.on('connect_error', () => this.connectionState.next('offline'));
    this.socket.ioSocket.io.on('reconnect_attempt', () =>
      this.connectionState.next('connecting')
    );
    this.socket.on('onlineUsers', (ids: number[]) => this.onlineUserIds.next(new Set(ids)));
    // New contacts (a new chat or group): who of them is online right now.
    this.socket.on('presenceBatch', (ids: number[]) =>
      this.onlineUserIds.next(new Set([...this.onlineUserIds.value, ...ids]))
    );
    this.socket.on('presence', ({ userId, online }: { userId: number; online: boolean }) => {
      const next = new Set(this.onlineUserIds.value);
      if (online) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
      this.onlineUserIds.next(next);
    });
  }

  connect() {
    if (!this.socket.ioSocket.connected) {
      this.connectionState.next('connecting');
    }
    this.socket.connectWithToken(getAccessToken() ?? '');
  }

  disconnect() {
    this.socket.disconnect();
    this.onlineUserIds.next(new Set());
  }

  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState.asObservable();
  }

  getOnlineUserIds(): Observable<Set<number>> {
    return this.onlineUserIds.asObservable();
  }

  getUnauthorized(): Observable<{ message: string }> {
    return this.socket.fromEvent<{ message: string }>('unauthorized');
  }

  getErrors(): Observable<{ message: string }> {
    return this.socket.fromEvent<{ message: string }>('chatError');
  }

  getAddedMessage(): Observable<IMessage> {
    return this.socket.fromEvent<IMessage>('messageAdded');
  }

  getRoomActivity(): Observable<IRoomActivity> {
    return this.socket.fromEvent<IRoomActivity>('roomActivity');
  }

  getRoomCreated(): Observable<IRoom> {
    return this.socket.fromEvent<IRoom>('roomCreated');
  }

  getUserUpdated(): Observable<IUser> {
    return this.socket.fromEvent<IUser>('userUpdated');
  }

  getTyping(): Observable<ITyping> {
    return this.socket.fromEvent<ITyping>('typing');
  }

  sendMessage(message: IMessage) {
    this.socket.emit('addMessage', { text: message.text, room: { id: message.room.id } });
  }

  openDirect(userId: number) {
    this.socket.emit('openDirect', { userId });
  }

  getDirectOpened(): Observable<IDirectOpened> {
    return this.socket.fromEvent<IDirectOpened>('directOpened');
  }

  /** Messages a person directly; the server creates the chat on the first one. */
  sendDirectMessage(userId: number, text: string) {
    this.socket.emit('sendDirectMessage', { userId, text });
  }

  getDirectRoomCreated(): Observable<IDirectRoomCreated> {
    return this.socket.fromEvent<IDirectRoomCreated>('directRoomCreated');
  }

  sendTyping(roomId: number) {
    this.socket.emit('typing', { roomId });
  }

  joinRoom(room: IRoom) {
    this.socket.emit('joinRoom', { id: room.id });
  }

  leaveRoom(room: IRoom) {
    this.socket.emit('leaveRoom', { id: room.id });
  }

  getMessages(): Observable<IMessagePaginate> {
    return this.socket.fromEvent<IMessagePaginate>('messages');
  }

  getOlderMessages(): Observable<IMessagePaginate> {
    return this.socket.fromEvent<IMessagePaginate>('olderMessages');
  }

  loadOlderMessages(roomId: number, page: number) {
    this.socket.emit('loadOlderMessages', { roomId, page });
  }

  getMyRooms(): Observable<IRoomPaginate> {
    return this.socket.fromEvent<IRoomPaginate>('rooms');
  }

  emitPaginateRooms(limit: number, page: number) {
    this.socket.emit('paginateRooms', { limit, page });
  }

  createRoom(room: IRoom) {
    this.socket.emit('createRoom', room);
  }
}
