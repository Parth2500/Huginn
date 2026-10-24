import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Chat, ChatStateChange, MuteFor } from 'src/app/models/chat.interface';
import { ConfirmDialogComponent } from 'src/app/shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from 'src/app/shared/icon/icon.component';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { isMuted } from '../../helpers/chat-display';
import { ChatService } from '../../services/chat.service';
import { ChatsStore } from '../../state/chats.store';

/** Pinned chats per person; Notes to self doesn't count (product-spec.md §1.2). */
const PIN_LIMIT = 5;

const MUTE_CHOICES: { value: Exclude<MuteFor, null>; label: string }[] = [
  { value: '8h', label: 'For 8 hours' },
  { value: '1w', label: 'For 1 week' },
  { value: 'always', label: 'Always' },
];

/**
 * The bulk actions for selected chats (product-spec.md §1.8, ux-design.md §2.3), docked at the
 * bottom of the rail. An action that doesn't apply is disabled and says why.
 */
@Component({
  selector: 'app-selection-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ConfirmDialogComponent],
  templateUrl: './selection-bar.component.html',
  styleUrls: ['./selection-bar.component.scss'],
})
export class SelectionBarComponent {
  private readonly chatService = inject(ChatService);
  private readonly store = inject(ChatsStore);
  private readonly toast = inject(ToastService);

  readonly chats = input.required<Chat[]>();
  readonly archivedView = input(false);
  /** The action ran (or was refused): selection mode ends. */
  readonly done = output<void>();
  /** Exactly one chat: its full row menu, anchored on this button. */
  readonly more = output<HTMLElement>();
  /** Marking the open chat unread closes it. */
  readonly closesOpen = output<number[]>();

  readonly muteOpen = signal(false);
  readonly confirmingDelete = signal(false);
  readonly muteChoices = MUTE_CHOICES;

  readonly allMuted = computed(() => this.chats().every((chat) => isMuted(chat)));
  readonly anyUnread = computed(() =>
    this.chats().some((chat) => chat.unreadCount > 0 || chat.me.markedUnread),
  );
  readonly allPinned = computed(() => this.chats().every((chat) => !!chat.me.pinnedAt));
  /** Why Pin can't run, or null. */
  readonly pinBlocked = computed(() => {
    if (this.allPinned()) {
      return null;
    }
    const counted = (list: Chat[]) => list.filter((chat) => chat.kind !== 'self').length;
    const pinned = counted(this.store.chats().filter((chat) => !!chat.me.pinnedAt));
    const adding = counted(this.chats().filter((chat) => !chat.me.pinnedAt));
    return pinned + adding > PIN_LIMIT ? `Pin: limit of ${PIN_LIMIT} reached` : null;
  });
  readonly deleteBlocked = computed(() =>
    this.chats().some((chat) => chat.kind === 'group')
      ? 'Delete: leave a group before deleting it'
      : null,
  );
  readonly deleteText = computed(() => {
    const count = this.chats().length;
    return {
      title: count === 1 ? 'Delete 1 chat?' : `Delete ${count} chats?`,
      body: 'Your copy of their messages will be removed. The other people keep theirs.',
      action: count === 1 ? 'Delete chat' : 'Delete chats',
    };
  });

  archive() {
    const archive = !this.archivedView();
    const ids = this.ids();
    // Undo puts back the pins that archiving removed.
    const pinned = this.chats()
      .filter((chat) => !!chat.me.pinnedAt)
      .map((chat) => chat.id);
    void this.run({ archive }, archive ? this.archivedText(ids.length) : this.unarchivedText(ids.length), async () => {
      if (archive) {
        await this.chatService.changeState(ids, { archive: false });
        if (pinned.length) {
          await this.chatService.changeState(pinned, { pin: true });
        }
      } else {
        await this.chatService.changeState(ids, { archive: true });
      }
    });
  }

  mute(value: MuteFor) {
    this.muteOpen.set(false);
    void this.run({ mute: value });
  }

  toggleRead() {
    const unread = !this.anyUnread();
    if (unread) {
      this.closesOpen.emit(this.ids());
    }
    void this.run({ unread });
  }

  togglePin() {
    void this.run({ pin: !this.allPinned() });
  }

  async confirmDelete() {
    this.confirmingDelete.set(false);
    const count = this.chats().length;
    this.closesOpen.emit(this.ids());
    await this.run({ delete: true }, count === 1 ? 'Chat deleted.' : `${count} chats deleted.`);
  }

  @HostListener('keydown.escape')
  closeMute() {
    this.muteOpen.set(false);
  }

  private ids() {
    return this.chats().map((chat) => chat.id);
  }

  private archivedText(count: number) {
    return count === 1 ? 'Chat archived.' : `${count} chats archived.`;
  }

  private unarchivedText(count: number) {
    return count === 1 ? 'Chat moved back to your chats.' : `${count} chats moved back to your chats.`;
  }

  private async run(change: ChatStateChange, done?: string, undo?: () => Promise<void>) {
    const error = await this.chatService.changeState(this.ids(), change);
    this.done.emit();
    if (error) {
      this.toast.error(error);
    } else if (done && undo) {
      this.toast.undoable(done, () => void undo());
    } else if (done) {
      this.toast.show(done);
    }
  }
}
