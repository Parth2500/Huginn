import { IConnectedUser } from 'src/chat/entities/connected-user/connected-user.interface';
import { IUser } from 'src/user/entities/user.interface';

export interface IConnectedUserService {
  create(connectedUser: IConnectedUser): Promise<IConnectedUser>;
  findByUser(user: IUser): Promise<IConnectedUser[]>;
  findOnlineUserIds(): Promise<number[]>;
  deleteBySocketId(socketId: string);
  deleteAll();
}

export const ConnectedUserToken = 'ConnectedUserService';
