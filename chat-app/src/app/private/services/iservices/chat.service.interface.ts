import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { IMessage, IMessagePaginate } from 'src/app/models/message.interface';
import { IRoom, IRoomPaginate } from 'src/app/models/room.interface';

export interface IChatService {
  getAddedMessage(): Observable<IMessage>;
  sendMessage(message: IMessage): void;
  joinRoom(room: IRoom): void;
  leaveRoom(room: IRoom): void;
  getMessages(): Observable<IMessagePaginate>;
  getMyRooms(): Observable<IRoomPaginate>;
  emitPaginateRooms(limit: number, page: number): void;
  createRoom(room: IRoom): void;
}

export const ChatToken = new InjectionToken<IChatService>('IChatService');
