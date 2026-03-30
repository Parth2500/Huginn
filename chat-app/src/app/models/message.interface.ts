import { Meta } from '@angular/platform-browser';
import { IRoom } from './room.interface';
import { IUser } from './user.interface';

export interface IMessage {
  id?: number;
  text: string;
  user?: IUser;
  room: IRoom;
  created_at?: Date;
  updated_at?: Date;
}

export interface IMessagePaginate {
  items: IMessage[];
  meta: Meta;
}
