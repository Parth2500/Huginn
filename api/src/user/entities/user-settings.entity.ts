import { Column, Entity, PrimaryColumn } from 'typeorm';

export type Visibility = 'everyone' | 'contacts' | 'nobody';

/** Per-person preferences (docs/huginn/product-spec.md §5.4, §6.2, §7). Created on first change. */
@Entity('user_settings')
export class UserSettings {
  @PrimaryColumn()
  userId: number;

  @Column({ type: 'varchar', length: 8, default: 'contacts' })
  lastSeenVisibility: Visibility;

  @Column({ type: 'varchar', length: 8, default: 'everyone' })
  photoVisibility: Visibility;

  @Column({ type: 'boolean', default: true })
  readReceipts: boolean;

  @Column({ type: 'varchar', length: 8, default: 'contacts' })
  groupAddPolicy: Exclude<Visibility, 'nobody'>;

  @Column({ type: 'boolean', default: true })
  messageRequests: boolean;

  @Column({ type: 'boolean', default: true })
  enterToSend: boolean;

  @Column({ type: 'boolean', default: true })
  keepArchived: boolean;

  @Column({ type: 'boolean', default: true })
  notifyPreviews: boolean;

  @Column({ type: 'boolean', default: true })
  notifySounds: boolean;

  @Column({ type: 'varchar', length: 8, default: 'all' })
  groupNotifyMode: 'all' | 'mentions';

  @Column({ type: 'boolean', default: true })
  mentionsBreakMute: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  dndUntil: Date | null;

  @Column({ type: 'varchar', length: 6, default: 'system' })
  theme: 'system' | 'light' | 'dark';
}
