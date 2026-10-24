import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * When a member's delivered (`d`) or read (`r`) watermark moved, and how far. One row per move,
 * not per message: a message's delivered or read time is the first move that reached it. Only
 * message info reads it (architecture.md §6).
 */
@Entity('watermark_log')
@Index(['chatId', 'userId', 'kind', 'upTo'])
export class WatermarkLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chatId: number;

  @Column()
  userId: number;

  @Column({ type: 'char', length: 1 })
  kind: 'd' | 'r';

  @Column()
  upTo: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  at: Date;
}
