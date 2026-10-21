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
 * A sign-in account at an identity provider (Heimdall), linked to one Huginn user
 * (docs/huginn/architecture.md §2.2). `(issuer, subject)` is the identity; the email is only
 * what the provider reported, unverified, and shown to the owner.
 */
@Entity('user_identity')
@Index(['issuer', 'subject'], { unique: true })
@Index(['userId', 'issuer'], { unique: true })
export class UserIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user?: User;

  @Column({ type: 'varchar', length: 255 })
  issuer: string;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
