import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgClass, NgTemplateOutlet } from '@angular/common';
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
import {
  chatPartner,
  chatTitle,
  isMuted,
  mutedForever,
  personName,
  plainText,
  systemText,
} from '../../helpers/chat-display';
import { ChatService } from '../../services/chat.service';
import { ChatsStore } from '../../state/chats.store';
import { DraftsStore } from '../../state/drafts.store';
import { ChatMenuComponent } from '../chat-menu/chat-menu.component';
import { SelectionBarComponent } from '../selection-bar/selection-bar.component';

/** Past this many pixels sideways, a touch is a swipe rather than a tap or a scroll. */
const SWIPE_SLOP = 10;
/** Swipe left this far to archive. */
const SWIPE_ARCHIVE = 96;
/** Swipe right this far to show Pin and Mute (their width). */
const SWIPE_REVEAL = 144;

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
  styleUrls: ['./chat-list.component.scss', './chat-list-gestures.scss'],
  host: {
    '(keydown.escape)': 'onEscape($event)',
    '(keydown)': 'stepRow($event)',
  },
  imports: [
    NgClass,
    NgTemplateOutlet,
    CdkDropList,
    CdkDrag,
    AvatarComponent,
    IconComponent,
    ChatMenuComponent,
    ConfirmDialogComponent,
    SelectionBarComponent,
    InitialsPipe,
    TonePipe,
  ],
})
export class ChatListComponent {
  private readonly store = inject(ChatsStore);
  private readonly chatService = inject(ChatService);
  private readonly drafts = inject(DraftsStore);
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
  /** Pins can be reordered in the full main list (not filtered, not archived). */
  readonly pinnedRows = computed(() =>
    this.folder() === 'main' && this.filter() === 'all'
      ? this.listChats().filter((chat) => !!chat.me.pinnedAt)
      : [],
  );
  readonly otherRows = computed(() => {
    const pinned = new Set(this.pinnedRows());
    return this.listChats().filter((chat) => !pinned.has(chat));
  });
  /** Dragging needs a mouse or pen, and not while choosing chats. */
  readonly canDrag = computed(
    () => this.pinnedRows().length > 1 && !this.selecting() && matchMedia('(pointer: fine)').matches,
  );

  /** Selection mode (product-spec.md §1.8): rows toggle instead of opening. */
  readonly selecting = signal(false);
  readonly picked = signal(new Set<number>());
  /** The chosen chats still in view, in list order. */
  readonly pickedChats = computed(() => this.listChats().filter((chat) => this.picked().has(chat.id)));
  /** Where a Shift+click range starts. */
  private anchor: number | undefined;
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
  /** The row being swiped (or left open on its Pin and Mute buttons) and how far. */
  readonly swipe = signal<{ chat: Chat; offset: number; revealed: boolean } | null>(null);
  private swipeStart: { chat: Chat; x: number; y: number; base: number } | null = null;
  private swiping = false;

  // ---- Folders and paging --------------------------------------------------------------------

  showArchived() {
    this.endSelection();
    this.folder.set('archived');
    if (this.store.nextArchived() === undefined) {
      void this.chatService.loadArchived();
    }
  }

  showMain() {
    this.endSelection();
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

  onRowClick(chat: Chat, event?: MouseEvent) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    if (this.selecting() || event?.ctrlKey || event?.metaKey) {
      this.pick(chat, !!event?.shiftKey);
      return;
    }
    if (this.swipe()) {
      this.swipe.set(null); // a tap on a swiped-open row closes it
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
    // A swipe often ends with no click at all, so the flag can't wait for one to clear it.
    this.suppressClick = false;
    if (event.pointerType !== 'touch') {
      return;
    }
    const row = event.currentTarget as HTMLElement;
    const at = { x: event.clientX, y: event.clientY };
    if (this.swipe()?.revealed && this.swipe()?.chat.id !== chat.id) {
      this.swipe.set(null);
    }
    this.swipeStart = this.selecting() ? null : { chat, x: at.x, y: at.y, base: this.swipeOffset(chat) };
    this.longPress = setTimeout(() => {
      this.suppressClick = true;
      // A long-press starts choosing chats; the bar's More holds this row's full menu.
      this.pick(chat, false);
    }, 500);
  }

  pressEnd() {
    clearTimeout(this.longPress);
  }

  // ---- Swipe (phones, ux-design.md §1.2): left archives, right shows Pin and Mute -------------

  /** Follows a finger sideways; vertical moves stay page scrolls (`touch-action: pan-y`). */
  swipeMove(event: PointerEvent) {
    const start = this.swipeStart;
    if (!start || event.pointerType !== 'touch') {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!this.swiping) {
      if (Math.abs(dx) < SWIPE_SLOP || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      this.swiping = true;
      clearTimeout(this.longPress);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    const offset = Math.max(-SWIPE_ARCHIVE * 1.5, Math.min(SWIPE_REVEAL * 1.2, start.base + dx));
    this.swipe.set({ chat: start.chat, offset, revealed: false });
  }

  swipeEnd() {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || !this.swiping) {
      return;
    }
    this.swiping = false;
    this.suppressClick = true; // the click that ends a swipe doesn't open the chat
    const offset = this.swipe()?.offset ?? 0;
    if (offset <= -SWIPE_ARCHIVE) {
      this.swipe.set(null);
      void this.onMenuChoice(start.chat, { archive: !start.chat.me.archivedAt });
    } else if (offset >= SWIPE_REVEAL / 2) {
      this.swipe.set({ chat: start.chat, offset: SWIPE_REVEAL, revealed: true });
    } else {
      this.swipe.set(null);
    }
  }

  swipeOffset(chat: Chat): number {
    const swipe = this.swipe();
    return swipe?.chat.id === chat.id ? swipe.offset : 0;
  }

  /** A button behind a row swiped right. */
  async swipeAction(chat: Chat, action: 'pin' | 'mute') {
    this.swipe.set(null);
    const change: ChatStateChange =
      action === 'pin' ? { pin: !chat.me.pinnedAt } : { mute: isMuted(chat) ? null : 'always' };
    // A timed mute can't be put back exactly, so unmuting one offers no Undo.
    const undoable = !('mute' in change) || change.mute !== null || mutedForever(chat);
    const error = await this.chatService.changeState([chat.id], change);
    if (error) {
      this.toast.error(error);
      return;
    }
    const undo: ChatStateChange =
      'pin' in change ? { pin: !change.pin } : { mute: change.mute ? null : 'always' };
    const text =
      'pin' in change
        ? change.pin ? 'Chat pinned.' : 'Chat unpinned.'
        : change.mute ? 'Chat muted.' : 'Chat unmuted.';
    if (undoable) {
      this.toast.undoable(text, () => void this.undo(chat.id, undo));
    } else {
      this.toast.show(text);
    }
  }

  // ---- Selection --------------------------------------------------------------------------

  startSelection() {
    this.menu.set(null);
    this.swipe.set(null);
    this.selecting.set(true);
  }

  /** Toggles a chat; with Shift, everything from the last one picked to this one. */
  pick(chat: Chat, range: boolean) {
    this.startSelection();
    const rows = this.listChats();
    const next = new Set(this.picked());
    const from = rows.findIndex((c) => c.id === this.anchor);
    if (range && from >= 0) {
      const to = rows.indexOf(chat);
      rows.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((c) => next.add(c.id));
    } else if (next.has(chat.id)) {
      next.delete(chat.id);
    } else {
      next.add(chat.id);
    }
    this.anchor = chat.id;
    this.picked.set(next);
    if (next.size === 0) {
      this.endSelection();
    }
  }

  /** While selecting, ↑/↓ move between rows, and with Shift they pick as they go. */
  stepRow(event: Event) {
    const key = (event as KeyboardEvent).key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp') {
      return;
    }
    const step = key === 'ArrowDown' ? 1 : -1;
    const shift = (event as KeyboardEvent).shiftKey;
    const rows = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.room-list .row > .room')];
    const from = rows.indexOf(document.activeElement as HTMLElement);
    if (!this.selecting() || from < 0) {
      return;
    }
    event.preventDefault();
    const to = Math.max(0, Math.min(rows.length - 1, from + step));
    rows[to].focus();
    const chat = this.listChats()[to];
    if (shift && chat && !this.picked().has(chat.id)) {
      this.picked.update((set) => new Set(set).add(chat.id));
      this.anchor = chat.id;
    }
  }

  pickAll() {
    this.picked.set(new Set(this.listChats().map((chat) => chat.id)));
  }

  /** Esc leaves selection mode, unless it's closing a dialog or menu inside it. */
  onEscape(event: Event) {
    if (!(event.target as Element).closest('dialog, [role=menu]')) {
      this.endSelection();
    }
  }

  endSelection() {
    if (!this.selecting()) {
      return;
    }
    this.selecting.set(false);
    this.picked.set(new Set());
    this.anchor = undefined;
  }

  /** The bar's More, for exactly one chat: its full row menu. */
  openMenuFor(button: HTMLElement) {
    const chat = this.pickedChats()[0];
    if (chat) {
      const rect = button.getBoundingClientRect();
      this.menu.set({ chat, at: { x: rect.left, y: rect.top - 8 }, returnFocus: button });
    }
  }

  /** Bulk mark-unread or delete includes the open chat: close it. */
  onBulkTouches(ids: number[]) {
    const open = this.selectedChatId();
    if (open !== undefined && ids.includes(open)) {
      this.closeSelected.emit();
    }
  }

  closeMenu() {
    const open = this.menu();
    this.menu.set(null);
    open?.returnFocus.focus();
  }

  async onMenuChoice(chat: Chat, change: ChatStateChange) {
    const focus = this.menu()?.returnFocus;
    this.closeMenu();
    this.endSelection();
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

  // ---- Pin order ---------------------------------------------------------------------------

  dropPin(event: CdkDragDrop<unknown>) {
    if (event.previousIndex !== event.currentIndex) {
      const ids = this.pinnedRows().map((chat) => chat.id);
      moveItemInArray(ids, event.previousIndex, event.currentIndex);
      void this.reorder(ids);
    }
  }

  /** Which ways a pinned chat can move from the menu, the keyboard's way to reorder. */
  pinMoves(chat: Chat): { up: boolean; down: boolean } {
    const index = this.pinnedRows().indexOf(chat);
    return { up: index > 0, down: index >= 0 && index < this.pinnedRows().length - 1 };
  }

  movePin(chat: Chat, direction: 'up' | 'down') {
    const ids = this.pinnedRows().map((c) => c.id);
    const from = ids.indexOf(chat.id);
    this.closeMenu();
    moveItemInArray(ids, from, from + (direction === 'up' ? -1 : 1));
    void this.reorder(ids);
  }

  private async reorder(ids: number[]) {
    const error = await this.chatService.reorderPins(ids);
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
      return chat.kind === 'self' ? 'Only you can see this' : `No messages yet · ${this.members(chat)}`;
    }
    if (message.kind === 'system') {
      return systemText(message.system, this.me(), chat.members);
    }
    if (message.deleted) {
      return message.deletedById === this.me().Id ? 'You deleted this message' : 'This message was deleted';
    }
    const text = plainText(message.text ?? '');
    if (chat.kind === 'self') {
      return text; // every note is yours
    }
    if (message.sender?.Id === this.me().Id) {
      return `You: ${text}`;
    }
    // In a direct chat the sender is obvious; in a group, name them.
    return chat.kind === 'direct' ? text : `${personName(message.sender)}: ${text}`;
  }

  /** Unsent text in a chat you're not looking at: "Draft: …" (product-spec.md §3.8). */
  draft(chat: Chat): string {
    return this.isSelected(chat) ? '' : this.drafts.get(`c${chat.id}`).trim();
  }

  /** The tick on your own last message, shown before the preview (ux-design.md §2.1). */
  lastTick(chat: Chat): 'sent' | 'delivered' | 'read' | null {
    const last = chat.lastMessage;
    if (!last || last.deleted || chat.kind === 'self' || last.sender?.Id !== this.me().Id) {
      return null;
    }
    return last.id <= chat.receipts.readUpTo
      ? 'read'
      : last.id <= chat.receipts.deliveredUpTo
        ? 'delivered'
        : 'sent';
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
