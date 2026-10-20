import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { getAccessToken } from 'src/app/app.module';
import {
  IMessage,
  IMessagePaginate,
  IRoomActivity,
  ITyping,
} from 'src/app/models/message.interface';
import { IRoom, IRoomPaginate } from 'src/app/models/room.interface';
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

  getTyping(): Observable<ITyping> {
    return this.socket.fromEvent<ITyping>('typing');
  }

  sendMessage(message: IMessage) {
    this.socket.emit('addMessage', { text: message.text, room: { id: message.room.id } });
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
