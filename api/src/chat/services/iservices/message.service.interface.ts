import { IPaginationOptions, Pagination } from 'src/common/pagination';
import { IMessage } from 'src/chat/entities/message/message.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';

export interface IMessageService {
  create(message: IMessage): Promise<IMessage>;
  findMessagesForRoom(
    room: IRoom,
    options: IPaginationOptions,
  ): Promise<Pagination<IMessage>>;
  findLatestForRooms(roomIds: number[]): Promise<Map<number, IMessage>>;
}

export const MessageToken = 'MessageService';
