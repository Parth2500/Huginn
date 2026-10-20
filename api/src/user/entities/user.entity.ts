import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IUser } from './user.interface';

// Trigram search indexes live in a migration; TypeORM can't express gin_trgm_ops, so it must not touch them.
@Index('user_username_key_trgm', { synchronize: false })
@Index('user_display_name_trgm', { synchronize: false })
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

  /** Written once when the last connection closes (after a grace period); never broadcast. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  /** Highest sequence number in this person's update log (see UserUpdate). */
  @Column({ type: 'int', default: 0, select: false })
  updateSeq: number;

  // Private: only ever returned to its owner (login token payload is built without it).
  @Column({ unique: true, select: false })
  email: string;

  @Column({ select: false })
  password: string;
}
