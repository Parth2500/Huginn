import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Session } from 'src/auth/session.entity';
import { User } from 'src/user/entities/user.entity';

/**
 * One browser's Web Push subscription (architecture.md §8). It belongs to the session that
 * created it, so signing out of that browser removes it with the session.
 */
@Entity('push_subscription')
export class PushSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  /** The push service's URL for this browser. Unique: a browser has one per origin. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 2048 })
  endpoint: string;

  @Column({ type: 'varchar', length: 200 })
  p256dh: string;

  @Column({ type: 'varchar', length: 100 })
  auth: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
