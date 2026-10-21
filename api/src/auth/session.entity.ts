import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';

/**
 * A signed-in browser (docs/huginn/architecture.md §2.3). The cookie holds a random token; only
 * its SHA-256 is stored, so a database leak can't be replayed as sessions.
 */
@Entity('session')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Index()
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user?: User;

  /** Which AuthProvider signed this session in ('local' today, 'heimdall' later). */
  @Column({ type: 'varchar', length: 20 })
  provider: string;

  /** Whatever the provider must keep for the session, e.g. Heimdall's refresh token later. */
  @Column({ type: 'jsonb', nullable: true })
  providerData: unknown;

  @Column({ type: 'varchar', length: 200, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  lastUsedAt: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
