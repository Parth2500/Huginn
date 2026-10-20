import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { Room } from 'src/chat/entities/room/room.entity';
import { IRoom } from 'src/chat/entities/room/room.interface';
import { IUser } from 'src/user/entities/user.interface';
import { In, Repository } from 'typeorm';
import { IRoomService } from '../iservices/room.service.interface';

@Injectable()
export class RoomService implements IRoomService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async createRoom(room: IRoom, creator: IUser): Promise<IRoom> {
    const newRoom = await this.addCreatorToRoom(room, creator);
    return this.roomRepository.save(newRoom);
  }

  async getRoom(roomId: number): Promise<IRoom> {
    return this.roomRepository.findOne({
      where: {
        id: roomId,
      },
      relations: {
        users: true,
      },
    });
  }

  async getRoomsForUser(
    userId: number,
    options: IPaginationOptions,
  ): Promise<Pagination<IRoom>> {
    // Count and page on rooms alone: joining every member before counting multiplied the total
    // by the member count. The user primary key column is "Id", not "id".
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Number(options.limit) || 10);
    const memberOf = this.roomRepository
      .createQueryBuilder('room')
      .innerJoin('room.users', 'member')
      .where('member.Id = :userId', { userId });

    const totalItems = await memberOf.getCount();
    const rows = await memberOf
      .clone()
      .select('room.id', 'id')
      .orderBy('room.updated_at', 'DESC')
      .addOrderBy('room.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: number }>();
    const ids = rows.map((row) => Number(row.id));

    const rooms = ids.length
      ? await this.roomRepository.find({ where: { id: In(ids) }, relations: { users: true } })
      : [];
    const items = ids.map((id) => rooms.find((room) => room.id === id)).filter(Boolean);

    return new Pagination<IRoom>(items, {
      totalItems,
      itemCount: items.length,
      itemsPerPage: limit,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
    });
  }

  async isMember(roomId: number, userId: number): Promise<boolean> {
    const count = await this.roomRepository
      .createQueryBuilder('room')
      .leftJoin('room.users', 'users')
      .where('room.id = :roomId', { roomId })
      .andWhere('users.Id = :userId', { userId })
      .getCount();
    return count > 0;
  }

  /** Marks the room as active now, so room lists sort by latest activity. */
  async touch(roomId: number): Promise<void> {
    await this.roomRepository.update(roomId, { updated_at: new Date() });
  }

  async addCreatorToRoom(room: IRoom, creator: IUser): Promise<IRoom> {
    const users = (room.users ?? []).filter((user) => user.Id !== creator.Id);
    room.users = [...users, creator];
    return room;
  }
}
