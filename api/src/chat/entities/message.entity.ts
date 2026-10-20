import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Chat } from './chat.entity';

export type MessageKind = 'text' | 'system';

@Entity('message')
@Index(['chatId', 'id'])
@Index(['senderId', 'clientMessageId'], {
  unique: true,
  where: '"clientMessageId" IS NOT NULL',
})
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chatId: number;

  @ManyToOne(() => Chat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat: Chat;

  /** Null for system messages. */
  @Column({ type: 'int', nullable: true })
  senderId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'senderId' })
  sender: User | null;

  /** Set by the sending device; makes retries safe (unique per sender). */
  @Column({ type: 'uuid', nullable: true })
  clientMessageId: string | null;

  @Column({ type: 'varchar', length: 10, default: 'text' })
  kind: MessageKind;

  /** Plain text until Phase 2; then ciphertext moves to its own column and this is null. */
  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'int', nullable: true })
  replyToMessageId: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedForAllAt: Date | null;

  @Column({ type: 'int', nullable: true })
  deletedById: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
