import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * The per-user update log (docs/huginn/architecture.md §5). Every durable change a person should
 * see gets the next sequence number for that person; devices catch up with `sync { sinceSeq }`.
 */
@Entity('user_update')
@Index(['createdAt'])
export class UserUpdate {
  @PrimaryColumn()
  userId: number;

  @PrimaryColumn()
  seq: number;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'jsonb' })
  data: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
