import { Meta } from './meta.interface';
import { IMessage } from './message.interface';
import { IUser } from './user.interface';

export interface IRoom {
  id?: number;
  /** 'direct' is a one-to-one chat (no name of its own); 'group' is a named room. */
  type?: 'direct' | 'group';
  name?: string;
  description?: string;
  users?: IUser[];
  created_at?: Date;
  updated_at?: Date;
  /** Latest message, attached by the server to room lists. */
  lastMessage?: IMessage | null;
}

export interface IDirectOpened {
  partner: IUser;
  /** The existing chat with this person, or null when none exists yet (a draft). */
  room: IRoom | null;
}

export interface IDirectRoomCreated {
  room: IRoom;
  partnerId: number;
}

export interface IRoomPaginate {
  items: IRoom[];
  meta: Meta;
}
