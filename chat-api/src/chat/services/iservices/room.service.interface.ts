import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { IRoom } from 'src/chat/entities/room/room.interface';
import { IUser } from 'src/user/entities/user.interface';

export interface IRoomService {
  createRoom(room: IRoom, creator: IUser): Promise<IRoom>;
  getRoom(roomId: number): Promise<IRoom>;
  getRoomsForUser(
    userId: number,
    options: IPaginationOptions,
  ): Promise<Pagination<IRoom>>;
  addCreatorToRoom(room: IRoom, creator: IUser): Promise<IRoom>;
}

export const RoomToken = 'RoomService';
