import { IUser } from 'src/user/entities/user.interface';
import { IRoom } from '../room/room.interface';

export interface IMessage {
  id?: number;
  text: string;
  user: IUser;
  room: IRoom;
  created_at: Date;
  updated_at: Date;
}
