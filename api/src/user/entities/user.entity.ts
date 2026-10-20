import { ConnectedUser } from 'src/chat/entities/connected-user/connected-user.entity';
import { JoinedRoom } from 'src/chat/entities/joined-room/joined-room.entity';
import { Message } from 'src/chat/entities/message/message.entity';
import { Room } from 'src/chat/entities/room/room.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IUser } from './user.interface';

@Entity()
export class User implements IUser {
  @PrimaryGeneratedColumn()
  Id: number;

  /** As the owner typed it; shown to others. */
  @Column({ unique: true })
  username: string;

  /**
   * Canonical form from username.policy (lower case): what uniqueness and search use.
   * Byte-order ("C") collation lets its unique index answer prefix searches in sorted order.
   */
  @Column({ unique: true, nullable: true, collation: 'C' })
  usernameKey: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bio: string | null;

  /** Public path of the profile photo, e.g. /api/uploads/avatars/3-1a2b.webp */
  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn()
  created_at: Date;

  // Private: only ever returned to its owner (login token payload is built without it).
  @Column({ unique: true, select: false })
  email: string;

  @Column({ select: false })
  password: string;

  @ManyToMany(() => Room, (room) => room.users)
  rooms: Room[];

  @OneToMany(() => ConnectedUser, (connection) => connection.user)
  connections: ConnectedUser[];

  @OneToMany(() => JoinedRoom, (joinedRoom) => joinedRoom.room)
  joinedRooms: JoinedRoom[];

  @OneToMany(() => Message, (message) => message.user)
  messages: Message[];
}
