import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { MessageStatus, ShownMessage } from '../chat-room/chat-room.component';
import { NgClass, DatePipe } from '@angular/common';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { TonePipe } from '../../../shared/pipes/avatar.pipes';
import { RichTextPipe } from '../../../shared/pipes/rich-text.pipe';
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
    RichTextPipe,
    DisplayNamePipe
],
})
export class ChatMessageComponent {
  readonly message = input.required<ShownMessage>();
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
  /** Who's reading: tombstones say "You deleted this message" to the person who did. */
  readonly meId = input<number | undefined>();
  /** Selection mode (product-spec.md §3.6): a checkbox leads the message. */
  readonly selecting = input(false);
  readonly picked = input(false);
  /** Toggle this message's selection (a click in selection mode, or Ctrl/⌘+click). */
  readonly toggle = output<void>();
  /** A long-press on a touch screen: start selecting with this message. */
  readonly press = output<void>();
  /** A send the server refused: try again, or drop it. */
  readonly retry = output<void>();
  readonly discard = output<void>();
  /** "Not sent. Tap to see why." opens the reason and the choices. */
  readonly showWhy = signal(false);
  private pressTimer: ReturnType<typeof setTimeout> | undefined;

  readonly tombstone = computed(() => {
    const message = this.message();
    if (message.deletedById === this.meId() && message.deletedById !== null) {
      return 'You deleted this message';
    }
    if (message.deletedById !== null && message.deletedById !== message.sender?.Id) {
      return 'Deleted by an admin';
    }
    return 'This message was deleted';
  });

  onClick(event: MouseEvent) {
    if (this.selecting() || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.toggle.emit();
    }
  }

  pressStart(event: PointerEvent) {
    if (event.pointerType === 'touch' && !this.selecting()) {
      this.pressTimer = setTimeout(() => this.press.emit(), 500);
    }
  }

  pressEnd() {
    clearTimeout(this.pressTimer);
  }

  emitSender() {
    const sender = this.message().sender;
    if (sender) {
      this.openSender.emit(sender);
    }
  }
}
