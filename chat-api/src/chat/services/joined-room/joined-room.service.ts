import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JoinedRoom } from 'src/chat/entities/joined-room/joined-room.entity';
import { IJoinedRoom } from 'src/chat/entities/joined-room/joined-room.interface';
import { IRoom } from 'src/chat/entities/room/room.interface';
import { IUser } from 'src/user/entities/user.interface';
import { Repository } from 'typeorm';
import { IJoinedRoomService } from '../iservices/joined-room.service.interface';

@Injectable()
export class JoinedRoomService implements IJoinedRoomService {
  constructor(
    @InjectRepository(JoinedRoom)
    private readonly joinedRoomRepository: Repository<JoinedRoom>,
  ) {}

  async create(joinedRoom: IJoinedRoom): Promise<IJoinedRoom> {
    return this.joinedRoomRepository.save(joinedRoom);
  }

  async findByUser(user: IUser): Promise<IJoinedRoom[]> {
    return this.joinedRoomRepository.find({
      where: {
        user: user,
      },
    });
  }

  async findByRoom(room: IRoom): Promise<IJoinedRoom[]> {
    return this.joinedRoomRepository.find({
      where: {
        room: room,
      },
    });
  }

  async deleteBySocketId(socketId: string) {
    return this.joinedRoomRepository.delete({ socketId });
  }

  async deleteAll() {
    await this.joinedRoomRepository.createQueryBuilder().delete().execute();
  }
}
