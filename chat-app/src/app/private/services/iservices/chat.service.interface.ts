import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  IMessage,
  IMessagePaginate,
  IRoomActivity,
  ITyping,
} from 'src/app/models/message.interface';
import { IRoom, IRoomPaginate } from 'src/app/models/room.interface';

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface IChatService {
  connect(): void;
  disconnect(): void;
  getConnectionState(): Observable<ConnectionState>;
  getOnlineUserIds(): Observable<Set<number>>;
  getUnauthorized(): Observable<{ message: string }>;
  getErrors(): Observable<{ message: string }>;
  getAddedMessage(): Observable<IMessage>;
  getRoomActivity(): Observable<IRoomActivity>;
  getRoomCreated(): Observable<IRoom>;
  getTyping(): Observable<ITyping>;
  sendMessage(message: IMessage): void;
  sendTyping(roomId: number): void;
  joinRoom(room: IRoom): void;
  leaveRoom(room: IRoom): void;
  getMessages(): Observable<IMessagePaginate>;
  getOlderMessages(): Observable<IMessagePaginate>;
  loadOlderMessages(roomId: number, page: number): void;
  getMyRooms(): Observable<IRoomPaginate>;
  emitPaginateRooms(limit: number, page: number): void;
  createRoom(room: IRoom): void;
}

export const ChatToken = new InjectionToken<IChatService>('IChatService');
