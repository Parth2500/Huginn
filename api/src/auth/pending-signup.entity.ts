import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Someone who signed in at Heimdall but has no Huginn account yet. They choose a username
 * next; the ticket (a cookie, stored here as a SHA-256) proves which identity they brought.
 */
@Entity('pending_signup')
export class PendingSignup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 255 })
  issuer: string;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
