import { User } from 'src/user/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Room } from '../room/room.entity';
import { IJoinedRoom } from './joined-room.interface';

@Entity()
export class JoinedRoom implements IJoinedRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  socketId: string;

  @ManyToOne(() => User, (user) => user.joinedRooms)
  @JoinColumn()
  user: User;

  @ManyToOne(() => Room, (room) => room.joinedUsers)
  @JoinColumn()
  room: Room;
}
