import { Meta } from './meta.interface';
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
  roomId?: number;
  items: IMessage[];
  meta: Meta;
}

export interface IRoomActivity {
  roomId: number;
  message: IMessage;
}

export interface ITyping {
  roomId: number;
  user: { Id: number; username: string; displayName?: string | null };
}
