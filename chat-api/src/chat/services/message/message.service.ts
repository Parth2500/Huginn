import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IPaginationOptions,
  paginate,
  Pagination,
} from 'nestjs-typeorm-paginate';
import { Message } from 'src/chat/entities/message/message.entity';
import { IMessage } from 'src/chat/entities/message/message.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';
import { Repository } from 'typeorm';
import { IMessageService } from '../iservices/message.service.interface';

@Injectable()
export class MessageService implements IMessageService, OnModuleInit {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  /** History is read newest-first per chat; this index keeps that a short index range scan. */
  async onModuleInit() {
    try {
      await this.messageRepository.query(
        'CREATE INDEX IF NOT EXISTS message_room_id_desc ON message ("roomId", id DESC)',
      );
    } catch (error) {
      this.logger.warn(
        `Message index setup skipped: ${error?.message ?? error}`,
      );
    }
  }

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

    return paginate(query, options);
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
