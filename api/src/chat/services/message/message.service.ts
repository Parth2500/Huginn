import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IPaginationOptions,
  pageMeta,
  Pagination,
} from 'src/common/pagination';
import { Message } from 'src/chat/entities/message/message.entity';
import { IMessage } from 'src/chat/entities/message/message.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';
import { Repository } from 'typeorm';
import { IMessageService } from '../iservices/message.service.interface';

@Injectable()
export class MessageService implements IMessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async create(message: IMessage): Promise<IMessage> {
    return this.messageRepository.save(this.messageRepository.create(message));
  }

  async findMessagesForRoom(
    room: IRoom,
    options: IPaginationOptions,
  ): Promise<Pagination<IMessage>> {
    const query = this.messageRepository
      .createQueryBuilder('message')
      .leftJoin('message.room', 'room')
      .where('room.id = :roomId', { roomId: room.id })
      .leftJoinAndSelect('message.user', 'user')
      // Insertion order: ids are monotonic, created_at can tie under bursts.
      .orderBy('message.id', 'DESC');

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Number(options.limit) || 20);
    const [items, totalItems] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return new Pagination(
      items,
      pageMeta(totalItems, items.length, { page, limit }),
    );
  }

  /** Latest message of each room, keyed by room id, for room list previews. */
  async findLatestForRooms(roomIds: number[]): Promise<Map<number, IMessage>> {
    const latest = new Map<number, IMessage>();
    if (roomIds.length === 0) {
      return latest;
    }
    const messages = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.room', 'room')
      .leftJoinAndSelect('message.user', 'user')
      .where('room.id IN (:...roomIds)', { roomIds })
      .distinctOn(['room.id'])
      .orderBy('room.id')
      .addOrderBy('message.id', 'DESC')
      .getMany();
    for (const message of messages) {
      latest.set(message.room.id, {
        id: message.id,
        text: message.text,
        user: message.user,
        room: { id: message.room.id },
        created_at: message.created_at,
        updated_at: message.updated_at,
      });
    }
    return latest;
  }
}
