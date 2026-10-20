import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
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
  /** Someone you share a chat with (or you) changed their name, photo or bio. */
  getUserUpdated(): Observable<IUser>;
  getTyping(): Observable<ITyping>;
  sendMessage(message: IMessage): void;
  openDirect(userId: number): void;
  getDirectOpened(): Observable<IDirectOpened>;
  sendDirectMessage(userId: number, text: string): void;
  getDirectRoomCreated(): Observable<IDirectRoomCreated>;
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
