import { IJoinedRoom } from 'src/chat/entities/joined-room/joined-room.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';
import { IUser } from 'src/user/entities/user.interface';

export interface IJoinedRoomService {
  create(joinedRoom: IJoinedRoom): Promise<IJoinedRoom>;
  findByUser(user: IUser): Promise<IJoinedRoom[]>;
  findByRoom(room: IRoom): Promise<IJoinedRoom[]>;
  deleteBySocketId(socketId: string);
  deleteAll();
}

export const JoinedRoomToken = 'JoinedRoomService';
