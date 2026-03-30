import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { IMessage } from 'src/chat/entities/message/message.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';

export interface IMessageService {
  create(message: IMessage): Promise<IMessage>;
  findMessagesForRoom(
    room: IRoom,
    options: IPaginationOptions,
  ): Promise<Pagination<IMessage>>;
}

export const MessageToken = 'MessageService';
