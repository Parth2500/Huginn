import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConnectedUser } from 'src/chat/entities/connected-user/connected-user.entity';
import { IConnectedUser } from 'src/chat/entities/connected-user/connected-user.interface';
import { IUser } from 'src/user/entities/user.interface';
import { Repository } from 'typeorm';
import { IConnectedUserService } from '../iservices/connected-user.service.interface';

@Injectable()
export class ConnectedUserService implements IConnectedUserService {
  constructor(
    @InjectRepository(ConnectedUser)
    private readonly connectedUserRepository: Repository<ConnectedUser>,
  ) {}

  async create(connectedUser: IConnectedUser): Promise<IConnectedUser> {
    return this.connectedUserRepository.save(connectedUser);
  }

  async findByUser(user: IUser): Promise<IConnectedUser[]> {
    return this.connectedUserRepository.find({
      where: {
        user: user,
      },
    });
  }

  async deleteBySocketId(socketId: string) {
    return this.connectedUserRepository.delete({ socketId });
  }

  async deleteAll() {
    await this.connectedUserRepository.createQueryBuilder().delete().execute();
  }
}
