import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Chat, ChatStateChange } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import { ConfirmDialogComponent } from 'src/app/shared/confirm-dialog/confirm-dialog.component';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { InitialsPipe, TonePipe } from '../../../shared/pipes/avatar.pipes';
import { chatPartner, chatTitle, isMuted, personName } from '../../helpers/chat-display';
import { ChatService } from '../../services/chat.service';
import { ChatsStore } from '../../state/chats.store';
import { ChatMenuComponent } from '../chat-menu/chat-menu.component';

type ChatFilter = 'all' | 'unread' | 'groups';

const FILTERS: { value: ChatFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'groups', label: 'Groups' },
];

/**
 * The rail's chat list (ux-design.md §2): the filter chips, the main list with pins first, the
 * Archived folder and its view, each row's badges, and the row menu.
 */
@Component({
  selector: 'app-chat-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss'],
  imports: [
    NgClass,
    AvatarComponent,
    IconComponent,
    ChatMenuComponent,
    ConfirmDialogComponent,
    InitialsPipe,
    TonePipe,
  ],
})
export class ChatListComponent {
  private readonly store = inject(ChatsStore);
  private readonly chatService = inject(ChatService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly me = input.required<IUser>();
  /** The chat open in the detail pane, highlighted here. */
  readonly selectedChatId = input<number | undefined>();
  readonly onlineIds = input(new Set<number>());
  readonly open = output<Chat>();
  /** Marking the open chat unread closes it, or it would read itself again at once. */
  readonly closeSelected = output<void>();

  readonly loaded = this.store.loaded;
  readonly fresh = this.store.fresh;
  readonly allChats = this.store.chats;
  /** Which list shows: the main one, or the Archived folder. */
  readonly folder = signal<'main' | 'archived'>('main');
  /** The main list's filter chips (product-spec.md §1.9). */
  readonly filters = FILTERS;
  readonly filter = signal<ChatFilter>('all');
  readonly listChats = computed(() => {
    if (this.folder() === 'archived') {
      return this.store.archivedChats();
    }
    const filter = this.filter();
    const open = this.selectedChatId();
    return this.store
      .mainChats()
      .filter((chat) =>
        filter === 'groups'
          ? chat.kind === 'group'
          : filter === 'unread'
            ? // The open chat stays, so reading it doesn't pull the row from under the pointer.
              chat.unreadCount > 0 || chat.me.markedUnread || chat.id === open
            : true,
      );
  });
  readonly archivedFolder = computed(() => this.store.folders().archived);
  readonly hasMoreChats = computed(() =>
    this.folder() === 'archived' ? !!this.store.nextArchived() : !!this.store.next(),
  );
  readonly loadingMore = signal(false);
  /** The open row menu, where it opened, and what gets focus back when it closes. */
  readonly menu = signal<{ chat: Chat; at: { x: number; y: number }; returnFocus: HTMLElement } | null>(
    null,
  );
  /** Clear or delete, waiting for the dialog's answer. */
  readonly confirming = signal<{ chat: Chat; action: 'clear' | 'delete'; focus: HTMLElement } | null>(
    null,
  );
  private longPress: ReturnType<typeof setTimeout> | undefined;
  /** A long-press opened the menu: the click that follows mustn't open the chat. */
  private suppressClick = false;

  // ---- Folders and paging --------------------------------------------------------------------

  showArchived() {
    this.folder.set('archived');
    if (this.store.nextArchived() === undefined) {
      void this.chatService.loadArchived();
    }
  }

  showMain() {
    this.folder.set('main');
  }

  async loadMoreChats() {
    this.loadingMore.set(true);
    if (this.folder() === 'archived') {
      await this.chatService.loadArchived(true);
    } else {
      await this.chatService.loadMoreChats();
    }
    this.loadingMore.set(false);
  }

  // ---- Rows and the row menu -----------------------------------------------------------------

  onRowClick(chat: Chat) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.open.emit(chat);
  }

  /**
   * Right-click: the menu opens at the pointer. The keyboard's menu key (or Shift+F10) fires
   * the same event with no pointer position, so then it opens below the row.
   */
  openMenuAt(event: MouseEvent, chat: Chat) {
    event.preventDefault();
    const row = event.currentTarget as HTMLElement;
    const fromKeyboard = event.button !== 2 && event.clientX === 0 && event.clientY === 0;
    const rect = row.getBoundingClientRect();
    this.menu.set({
      chat,
      at: fromKeyboard ? { x: rect.left + 12, y: rect.bottom + 4 } : { x: event.clientX, y: event.clientY },
      returnFocus: row,
    });
  }

  /** The row's chevron: the menu opens below it. */
  openMenuBelow(event: MouseEvent, chat: Chat) {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    this.menu.set({ chat, at: { x: rect.left, y: rect.bottom + 4 }, returnFocus: button });
  }

  /** A long-press on a touch screen opens the menu where the finger is. */
  pressStart(event: PointerEvent, chat: Chat) {
    if (event.pointerType !== 'touch') {
      return;
    }
    const row = event.currentTarget as HTMLElement;
    const at = { x: event.clientX, y: event.clientY };
    this.longPress = setTimeout(() => {
      this.suppressClick = true;
      this.menu.set({ chat, at, returnFocus: row });
    }, 500);
  }

  pressEnd() {
    clearTimeout(this.longPress);
  }

  closeMenu() {
    const open = this.menu();
    this.menu.set(null);
    open?.returnFocus.focus();
  }

  async onMenuChoice(chat: Chat, change: ChatStateChange) {
    const focus = this.menu()?.returnFocus;
    this.closeMenu();
    if ('clear' in change || 'delete' in change) {
      if (focus) {
        this.confirming.set({ chat, action: 'clear' in change ? 'clear' : 'delete', focus });
      }
      return;
    }
    if ('unread' in change && change.unread && this.isSelected(chat)) {
      this.closeSelected.emit();
    }
    const wasPinned = !!chat.me.pinnedAt;
    const error = await this.chatService.changeState([chat.id], change);
    if (error) {
      this.toast.error(error);
    } else if ('archive' in change) {
      // Archiving unpinned it; undoing pins it again (which also unarchives).
      const undo: ChatStateChange = change.archive
        ? wasPinned
          ? { pin: true }
          : { archive: false }
        : { archive: true };
      this.toast.undoable(change.archive ? 'Chat archived.' : 'Chat moved back to your chats.', () =>
        void this.undo(chat.id, undo),
      );
    }
  }

  private async undo(chatId: number, change: ChatStateChange) {
    const error = await this.chatService.changeState([chatId], change);
    if (error) {
      this.toast.error(error);
    }
  }

  /** What the dialog says (product-spec.md §1.4–1.5): the result, not the mechanism. */
  confirmText(chat: Chat, action: 'clear' | 'delete') {
    const title = this.chatTitle(chat);
    const others = chat.kind === 'group' ? 'Other members keep theirs.' : `${title} keeps theirs.`;
    return action === 'delete'
      ? {
          title: `Delete chat with ${title}?`,
          body: `Your copy of these messages will be removed. ${others}`,
          action: 'Delete chat',
        }
      : {
          title: chat.kind === 'group' ? `Clear ${title}?` : `Clear chat with ${title}?`,
          body: `Every message so far will be removed for you. ${others}`,
          action: 'Clear chat',
        };
  }

  cancelConfirm() {
    const pending = this.confirming();
    this.confirming.set(null);
    this.focusAfterDialog(pending?.focus);
  }

  async confirmAction() {
    const pending = this.confirming();
    if (!pending) {
      return;
    }
    const { chat, action } = pending;
    this.confirming.set(null);
    if (action === 'delete' && this.isSelected(chat)) {
      this.closeSelected.emit();
    }
    const error = await this.chatService.changeState(
      [chat.id],
      action === 'delete' ? { delete: true } : { clear: true },
    );
    if (error) {
      this.toast.error(error);
    } else {
      this.toast.show(action === 'delete' ? 'Chat deleted.' : 'Chat cleared.');
    }
    // A deleted row is gone: keep the keyboard in the list.
    this.focusAfterDialog(action === 'clear' || error ? pending.focus : undefined);
  }

  /** Everything outside a modal dialog is inert, so focus moves once the dialog has gone. */
  private focusAfterDialog(target: HTMLElement | undefined) {
    afterNextRender(
      () => (target ?? this.host.nativeElement.querySelector<HTMLElement>('.room'))?.focus(),
      { injector: this.injector },
    );
  }

  // ---- What a row shows ----------------------------------------------------------------------

  isSelected(chat: Chat): boolean {
    return this.selectedChatId() === chat.id;
  }

  muted(chat: Chat): boolean {
    return isMuted(chat);
  }

  /** What a screen reader hears for a row: name, then its state. */
  rowLabel(chat: Chat): string {
    const parts = [this.chatTitle(chat)];
    if (chat.me.pinnedAt && this.folder() === 'main') {
      parts.push('pinned');
    }
    if (isMuted(chat)) {
      parts.push('muted');
    }
    if (chat.unreadCount) {
      parts.push(`${chat.unreadCount} unread`);
    } else if (chat.me.markedUnread) {
      parts.push('marked unread');
    }
    return parts.join(', ');
  }

  members(chat: Chat): string {
    const others = chat.members.filter((u) => u.Id !== this.me().Id);
    if (others.length === 0) {
      return 'Only you';
    }
    return others.map((u) => personName(u)).join(', ');
  }

  preview(chat: Chat): string {
    const message = chat.lastMessage;
    if (!message) {
      return `No messages yet · ${this.members(chat)}`;
    }
    const text = message.deleted ? 'Message deleted' : message.text ?? '';
    if (message.sender?.Id === this.me().Id) {
      return `You: ${text}`;
    }
    // In a direct chat the sender is obvious; in a group, name them.
    return chat.kind === 'direct' ? text : `${personName(message.sender)}: ${text}`;
  }

  chatTitle(chat: Chat): string {
    return chatTitle(chat, this.me());
  }

  /** Last activity: a time today, "Yesterday", or a short date. */
  activityLabel(chat: Chat): string {
    const raw = chat.lastMessage?.createdAt;
    if (!raw) {
      return '';
    }
    const date = new Date(raw);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === now.toDateString()) {
      // Same 24-hour format as the message bubbles.
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  /** A direct chat shows the other person, with their presence, as its avatar. */
  directPartner(chat: Chat): IUser | undefined {
    return chatPartner(chat, this.me());
  }
}
