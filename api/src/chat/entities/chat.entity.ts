import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatMember } from './chat-member.entity';

export type ChatKind = 'self' | 'direct' | 'group';
export type GroupPolicy = 'all' | 'admins';

/** A conversation: notes to self, a direct chat between two people, or a named group. */
@Entity('chat')
export class Chat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 10 })
  kind: ChatKind;

  /** "<lower user id>:<higher user id>" for direct chats, "<user id>" for a self chat. */
  @Index({ unique: true, where: '"directKey" IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true })
  directKey: string | null;

  /** Groups only. Direct chats are titled with the other person on each side. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @Column({ type: 'varchar', length: 6, default: 'admins' })
  editInfoPolicy: GroupPolicy;

  @Column({ type: 'varchar', length: 6, default: 'admins' })
  addMemberPolicy: GroupPolicy;

  @Column({ type: 'varchar', length: 6, default: 'all' })
  sendPolicy: GroupPolicy;

  @Column({ type: 'int', nullable: true })
  lastMessageId: number | null;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastActivityAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => ChatMember, (member) => member.chat)
  members: ChatMember[];
}
