import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { IMessage } from 'src/app/models/message.interface';
import { MessageStatus } from '../chat-room/chat-room.component';
import { NgClass, DatePipe } from '@angular/common';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { TonePipe } from '../../../shared/pipes/avatar.pipes';
import { LinkifyPipe } from '../../../shared/pipes/linkify.pipe';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';

@Component({
    selector: 'app-chat-message',
    templateUrl: './chat-message.component.html',
    styleUrls: ['./chat-message.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
    AvatarComponent,
    NgClass,
    IconComponent,
    DatePipe,
    TonePipe,
    LinkifyPipe,
    DisplayNamePipe
],
})
export class ChatMessageComponent {
  readonly message = input.required<IMessage>();
  readonly own = input(false);
  /** First message of a run from the same person: shows their name. */
  readonly first = input(true);
  /** Last message of a run: carries the bubble tail and the avatar. */
  readonly last = input(true);
  readonly status = input<MessageStatus>(null);
  readonly fresh = input(false);
  /** Groups name and picture each sender; a direct chat has only one other person. */
  readonly showSender = input(true);
  readonly openSender = output<IUser>();

  emitSender() {
    const sender = this.message().user;
    if (sender) {
      this.openSender.emit(sender);
    }
  }
}
