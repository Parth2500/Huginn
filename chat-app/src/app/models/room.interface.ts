import { Meta } from './meta.interface';
import { IMessage } from './message.interface';
import { IUser } from './user.interface';

export interface IRoom {
  id?: number;
  name?: string;
  description?: string;
  users?: IUser[];
  created_at?: Date;
  updated_at?: Date;
  /** Latest message, attached by the server to room lists. */
  lastMessage?: IMessage | null;
}

export interface IRoomPaginate {
  items: IRoom[];
  meta: Meta;
}
