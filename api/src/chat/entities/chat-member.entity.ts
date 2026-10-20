import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Chat } from './chat.entity';

export type MemberRole = 'owner' | 'admin' | 'member';
/** `request` is a message request the person hasn't accepted yet. */
export type MemberStatus = 'active' | 'request' | 'left' | 'removed';

/**
 * One person's membership of one chat. Everything here is private to that person: their role
 * is shared with the chat, but pins, archive, mute, clear point and read position are theirs.
 */
@Entity('chat_member')
@Index(['userId', 'status'])
export class ChatMember {
  @PrimaryColumn()
  chatId: number;

  @PrimaryColumn()
  userId: number;

  @ManyToOne(() => Chat, (chat) => chat.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat: Chat;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 6, default: 'member' })
  role: MemberRole;

  @Column({ type: 'varchar', length: 8, default: 'active' })
  status: MemberStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;

  /** New members see history from here on (0 = from the start). */
  @Column({ type: 'int', default: 0 })
  joinedAfterMessageId: number;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pinnedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  pinOrder: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  mutedUntil: Date | null;

  /** "Deleted" from your list; comes back when a new message arrives. */
  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  /** "Clear chat": messages up to this id are hidden for you. */
  @Column({ type: 'int', default: 0 })
  clearedBeforeMessageId: number;

  @Column({ type: 'boolean', default: false })
  markedUnread: boolean;

  @Column({ type: 'int', default: 0 })
  lastDeliveredMessageId: number;

  @Column({ type: 'int', default: 0 })
  lastReadMessageId: number;
}
