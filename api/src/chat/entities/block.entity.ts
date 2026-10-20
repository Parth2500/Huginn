import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('block')
export class Block {
  @PrimaryColumn()
  blockerId: number;

  @PrimaryColumn()
  blockedId: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
