import { User } from 'src/user/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JoinedRoom } from '../joined-room/joined-room.entity';
import { Message } from '../message/message.entity';
import { IRoom } from './room.interface';

@Entity()
export class Room implements IRoom {
  @PrimaryGeneratedColumn()
  id: number;

  /** 'direct' for a one-to-one chat, 'group' for a named room. */
  @Column({ default: 'group' })
  type: 'direct' | 'group';

  /** Groups have a name; direct chats are named after the other person on each side. */
  @Column({ nullable: true })
  name: string;

  /** "<lower user id>:<higher user id>" for direct chats, so each pair has at most one. */
  @Column({ nullable: true, unique: true })
  directKey: string;

  @Column({ nullable: true })
  description: string;

  @ManyToMany(() => User)
  @JoinTable()
  users: User[];

  @OneToMany(() => JoinedRoom, (joinedRoom) => joinedRoom.room)
  joinedUsers: JoinedRoom[];

  @OneToMany(() => Message, (message) => message.room)
  messages: Message[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
