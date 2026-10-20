import { Entity, PrimaryColumn } from 'typeorm';

/** "Delete for me": a message hidden for one person only. */
@Entity('message_hidden')
export class MessageHidden {
  @PrimaryColumn()
  userId: number;

  @PrimaryColumn()
  messageId: number;
}
