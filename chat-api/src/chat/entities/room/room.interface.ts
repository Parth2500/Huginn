import { IUser } from 'src/user/entities/user.interface';
import { IMessage } from '../message/message.interface';

export interface IRoom {
  id?: number;
  name?: string;
  description?: string;
  users?: IUser[];
  created_at?: Date;
  updated_at?: Date;
  /** Attached for room lists only; not a column. */
  lastMessage?: IMessage | null;
}
