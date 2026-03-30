import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import { IMessage, IMessagePaginate } from 'src/app/models/message.interface';
import { IRoom, IRoomPaginate } from 'src/app/models/room.interface';
import { CustomSocketService } from './custom-socket.service';
import { IChatService } from './iservices/chat.service.interface';

@Injectable({
  providedIn: 'root',
})
export class ChatService implements IChatService {
  constructor(
    private socket: CustomSocketService,
    private snackbar: MatSnackBar
  ) {}

  getAddedMessage(): Observable<IMessage> {
    return this.socket.fromEvent<IMessage>('messageAdded');
  }

  sendMessage(message: IMessage) {
    this.socket.emit('addMessage', message);
  }

  joinRoom(room: IRoom) {
    this.socket.emit('joinRoom', room);
  }

  leaveRoom(room: IRoom) {
    this.socket.emit('leaveRoom', room);
  }

  getMessages(): Observable<IMessagePaginate> {
    return this.socket.fromEvent<IMessagePaginate>('messages');
  }

  getMyRooms(): Observable<IRoomPaginate> {
    return this.socket.fromEvent<IRoomPaginate>('rooms');
  }

  emitPaginateRooms(limit: number, page: number) {
    this.socket.emit('paginateRooms', { limit, page });
  }

  createRoom(room: IRoom) {
    this.socket.emit('createRoom', room);
    this.snackbar.open(`Room ${room.name} created successfully`, 'Close', {
      duration: 2000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }
}
