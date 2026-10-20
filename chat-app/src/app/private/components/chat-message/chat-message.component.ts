import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { IMessage } from 'src/app/models/message.interface';
import { MessageStatus } from '../chat-room/chat-room.component';

@Component({
  selector: 'app-chat-message',
  templateUrl: './chat-message.component.html',
  styleUrls: ['./chat-message.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
  @Input() message: IMessage;
  @Input() own = false;
  /** First message of a run from the same person: shows their name. */
  @Input() first = true;
  /** Last message of a run: carries the bubble tail and the avatar. */
  @Input() last = true;
  @Input() status: MessageStatus = null;
  @Input() fresh = false;
  /** Groups name and picture each sender; a direct chat has only one other person. */
  @Input() showSender = true;
  @Output() openSender = new EventEmitter<IUser>();
}
