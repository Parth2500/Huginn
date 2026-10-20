import { NgClass, SlicePipe, formatDate } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ChatMessage, OpenChat } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { InitialsPipe, TonePipe } from '../../../shared/pipes/avatar.pipes';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';
import { chatPartner, chatTitle, personName } from '../../helpers/chat-display';
import { ChatService, ConnectionState } from '../../services/chat.service';
import { MessagesStore } from '../../state/messages.store';
import { OutboxStore } from '../../state/outbox.store';
import { ChatMessageComponent } from '../chat-message/chat-message.component';

/** Consecutive messages from one person within this window share a bubble group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Within this distance of the bottom, the stream follows new content. */
const PIN_THRESHOLD_PX = 160;
/** How long a "typing" ping keeps someone listed as typing. */
const TYPING_TTL_MS = 3500;
/** Minimum gap between our own typing pings. */
const TYPING_THROTTLE_MS = 2000;
/** How long a message that just arrived keeps its highlight. */
const FRESH_MS = 1000;

export type MessageStatus = 'pending' | 'stalled' | 'sent' | null;

/** What a bubble shows: a stored message, or one still in the outbox. */
export interface ShownMessage {
  id?: number;
  text: string | null;
  sender: IUser | null;
  createdAt: string;
  deleted: boolean;
}

export type StreamRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: ShownMessage;
      own: boolean;
      first: boolean;
      last: boolean;
      status: MessageStatus;
      fresh: boolean;
    };

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IconComponent,
    AvatarComponent,
    NgClass,
    ChatMessageComponent,
    FormsModule,
    ReactiveFormsModule,
    SlicePipe,
    TonePipe,
    InitialsPipe,
    DisplayNamePipe,
  ],
})
export class ChatRoomComponent implements AfterViewInit {
  private chatService = inject(ChatService);
  private messagesStore = inject(MessagesStore);
  private outbox = inject(OutboxStore);
  private locale = inject(LOCALE_ID);

  readonly chat = input.required<OpenChat>();
  readonly me = input<IUser>({});
  readonly connection = input<ConnectionState>('connecting');
  readonly onlineIds = input<Set<number>>(new Set());
  readonly back = output<void>();
  /** A name or photo was clicked: show that person's profile. */
  readonly openProfile = output<IUser>();
  private readonly messagesScroller = viewChild<ElementRef<HTMLElement>>('messages');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  chatMessage: FormControl<string | null> = new FormControl('');

  readonly chatId = computed(() => this.chat().id);
  /** Not saved yet: the chat is created when the first message is sent. */
  readonly isDraft = computed(() => this.chatId() === undefined);
  /** In a direct chat the other person stands in for the chat's avatar and name. */
  readonly partner = computed(() => chatPartner(this.chat(), this.me()));
  readonly title = computed(() => chatTitle(this.chat(), this.me()));
  readonly otherMembers = computed(() => this.chat().members.filter((u) => u.Id !== this.me().Id));
  readonly onlineOthers = computed(() =>
    this.otherMembers().filter((u) => this.onlineIds().has(u.Id!)),
  );

  /** Which conversation is open; changes only when the chat or the draft's person does. */
  private readonly conversation = computed(
    () => ({
      id: this.chatId(),
      partnerId: this.chat().kind === 'direct' ? this.partner()?.Id : undefined,
    }),
    { equal: (a, b) => a.id === b.id && a.partnerId === b.partnerId },
  );

  private readonly history = computed(() => this.messagesStore.history(this.chatId()));
  readonly loaded = computed(() => this.isDraft() || !!this.history()?.loaded);
  /** Older messages exist on the server: offer to load them. */
  readonly truncated = computed(() => this.loaded() && !!this.history()?.hasMore);

  /** This chat's sends still in the outbox, including a draft's first message. */
  private readonly pending = computed(() => {
    const id = this.chatId();
    const partnerId = this.chat().kind === 'direct' ? this.partner()?.Id : undefined;
    return this.outbox
      .entries()
      .filter(
        (e) =>
          (id !== undefined && e.chatId === id) ||
          (partnerId !== undefined && e.toUserId === partnerId),
      );
  });

  readonly rows = computed(() => this.buildRows());

  /** Messages from others that arrived while the reader was scrolled up. */
  readonly unseen = signal(0);
  readonly loadingOlder = signal(false);
  /** Who is typing right now, by user id. */
  private readonly typing = signal(new Map<number, string>());
  private readonly freshIds = signal(new Set<number>());

  readonly membersLabel = computed(() => {
    const others = this.otherMembers().map((u) => personName(u));
    return others.length ? `Members: you, ${others.join(', ')}` : 'Members: only you';
  });

  /** "maya is typing…", "maya and sam are typing…", or "3 people are typing…". */
  readonly typingLabel = computed(() => {
    const names = [...this.typing().values()];
    if (names.length === 0) {
      return null;
    }
    if (names.length === 1) {
      return `${names[0]} is typing…`;
    }
    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing…`;
    }
    return `${names.length} people are typing…`;
  });

  readonly statusLine = computed(() => {
    const partner = this.partner();
    if (partner) {
      const online = this.onlineIds().has(partner.Id!) || partner.online;
      return `@${partner.username} · ${online ? 'online' : 'offline'}`;
    }
    const others = this.otherMembers().length;
    const online = this.onlineOthers().length;
    const presence = online > 0 ? `${online} of ${others} others online` : `${others + 1} members`;
    const description = this.chat().description;
    return description ? `${description} · ${presence}` : presence;
  });

  private pinned = true;
  private resizeObserver?: ResizeObserver;
  private lastTypingSent = 0;
  private typingTimers = new Map<number, ReturnType<typeof setTimeout>>();
  /** Newest message id already on screen, to tell live arrivals from history. */
  private newestShown = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Opening a chat (and switching between chats) resets the view and asks for the latest page.
    // A draft becoming its real chat is the same conversation: the composer keeps its text.
    let previousPartner: number | undefined;
    effect((onCleanup) => {
      const { id, partnerId } = this.conversation();
      const sameConversation = partnerId !== undefined && partnerId === previousPartner;
      previousPartner = partnerId;
      if (!sameConversation) {
        untracked(() => this.resetView());
      }
      if (id === undefined) {
        return;
      }
      void this.chatService.openChat(id);
      onCleanup(() => this.chatService.closeChat(id));
    });

    // New messages: follow them when at the bottom, otherwise count them; mark them read.
    effect(() => {
      const messages = this.history()?.messages ?? [];
      const pendingCount = this.pending().length;
      untracked(() => this.onStreamChanged(messages, pendingCount));
    });

    this.chatService.typing.pipe(takeUntilDestroyed()).subscribe(({ chatId, user }) => {
      if (chatId !== this.chatId() || user.Id === this.me().Id) {
        return;
      }
      clearTimeout(this.typingTimers.get(user.Id));
      this.typingTimers.set(
        user.Id,
        setTimeout(() => this.stopTyping(user.Id), TYPING_TTL_MS),
      );
      this.typing.update((map) => new Map(map).set(user.Id, personName(user)));
    });

    const onVisible = () => {
      const id = this.chatId();
      if (document.visibilityState === 'visible' && id !== undefined) {
        this.chatService.markRead(id);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisible);
      this.clearTyping();
      this.resizeObserver?.disconnect();
    });
  }

  ngAfterViewInit() {
    const el = this.messagesScroller()?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    // The composer growing (offline banner, multi-line draft) shrinks the stream; stay on the latest message.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.pinned) {
        el.scrollTop = el.scrollHeight;
      }
    });
    this.resizeObserver.observe(el);
    if (el.firstElementChild) {
      this.resizeObserver.observe(el.firstElementChild);
    }
    // On wide screens the composer is ready for typing as soon as a chat opens.
    if (window.matchMedia('(min-width: 768px)').matches) {
      setTimeout(() => this.composer()?.nativeElement.focus());
    }
  }

  get canSend(): boolean {
    return !!this.chatMessage.value?.trim();
  }

  sendMessage() {
    const text = this.chatMessage.value?.trim();
    if (!text) {
      return;
    }
    const id = this.chatId();
    const partnerId = this.partner()?.Id;
    if (id !== undefined) {
      this.chatService.send({ chatId: id }, text);
    } else if (partnerId !== undefined) {
      this.chatService.send({ toUserId: partnerId }, text);
    }
    this.chatMessage.reset('');
    this.resizeComposer();
    this.scrollToBottom(true);
  }

  onComposerInput() {
    this.resizeComposer();
    const now = Date.now();
    const id = this.chatId();
    if (id !== undefined && this.chatMessage.value?.trim() && now - this.lastTypingSent > TYPING_THROTTLE_MS) {
      this.lastTypingSent = now;
      this.chatService.sendTyping(id);
    }
  }

  async loadOlder() {
    const id = this.chatId();
    if (this.loadingOlder() || id === undefined) {
      return;
    }
    this.loadingOlder.set(true);
    const el = this.messagesScroller()?.nativeElement;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    await this.chatService.loadOlder(id);
    this.loadingOlder.set(false);
    // Keep the reader's place on screen as older messages appear above.
    setTimeout(() => {
      if (el) {
        el.scrollTop = el.scrollHeight - fromBottom;
      }
    });
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  resizeComposer() {
    const el = this.composer()?.nativeElement;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  onStreamScroll() {
    const el = this.messagesScroller()?.nativeElement;
    if (!el) {
      return;
    }
    this.pinned = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
    if (this.pinned) {
      this.unseen.set(0);
    }
  }

  jumpToLatest() {
    this.unseen.set(0);
    this.scrollToBottom(true);
  }

  private resetView() {
    this.unseen.set(0);
    this.pinned = true;
    this.newestShown = 0;
    this.loadingOlder.set(false);
    this.freshIds.set(new Set());
    this.clearTyping();
    this.chatMessage.reset('');
  }

  private onStreamChanged(messages: ChatMessage[], pendingCount: number) {
    const newest = messages.at(-1);
    const id = this.chatId();
    if (!newest || newest.id <= this.newestShown) {
      if (pendingCount > 0) {
        this.scrollToBottom(true);
      }
      return;
    }
    const firstLoad = this.newestShown === 0;
    const arrived = messages.filter((m) => m.id > this.newestShown);
    this.newestShown = newest.id;
    if (firstLoad) {
      this.scrollToBottom(true);
    } else {
      const fromOthers = arrived.filter((m) => m.sender?.Id !== this.me().Id);
      fromOthers.forEach((m) => {
        if (m.sender?.Id !== undefined) {
          this.stopTyping(m.sender.Id);
        }
      });
      this.markFresh(fromOthers.map((m) => m.id));
      const own = arrived.length > fromOthers.length;
      if (!this.pinned && !own) {
        this.unseen.update((n) => n + fromOthers.length);
      }
      this.scrollToBottom(own);
    }
    if (id !== undefined && document.visibilityState === 'visible') {
      this.chatService.markRead(id);
    }
  }

  private buildRows(): StreamRow[] {
    const meId = this.me().Id;
    const stalled = this.outbox.stalled();
    const fresh = this.freshIds();
    const entries: { message: ShownMessage; status: MessageStatus; key: string }[] = [
      ...(this.history()?.messages ?? []).map((m) => ({
        message: m as ShownMessage,
        status: (m.sender?.Id === meId ? 'sent' : null) as MessageStatus,
        key: `m${m.id}`,
      })),
      ...this.pending().map((p) => ({
        message: { text: p.text, sender: this.me(), createdAt: p.createdAt, deleted: false },
        status: (stalled.has(p.clientMessageId) ? 'stalled' : 'pending') as MessageStatus,
        key: `p${p.clientMessageId}`,
      })),
    ];

    const rows: StreamRow[] = [];
    let lastDay = '';
    entries.forEach((entry, i) => {
      const date = new Date(entry.message.createdAt);
      const day = date.toDateString();
      if (day !== lastDay) {
        rows.push({ kind: 'day', key: `d${day}`, label: this.dayLabel(date) });
        lastDay = day;
      }
      const prev = entries[i - 1]?.message;
      const next = entries[i + 1]?.message;
      rows.push({
        kind: 'message',
        key: entry.key,
        message: entry.message,
        own: entry.message.sender?.Id === meId,
        first: !prev || !sameGroup(prev, entry.message),
        last: !next || !sameGroup(entry.message, next),
        status: entry.status,
        fresh: entry.message.id !== undefined && fresh.has(entry.message.id),
      });
    });
    return rows;
  }

  private markFresh(ids: number[]) {
    if (ids.length === 0) {
      return;
    }
    this.freshIds.update((set) => new Set([...set, ...ids]));
    setTimeout(
      () =>
        this.freshIds.update((set) => {
          const copy = new Set(set);
          ids.forEach((id) => copy.delete(id));
          return copy;
        }),
      FRESH_MS,
    );
  }

  private stopTyping(userId: number) {
    clearTimeout(this.typingTimers.get(userId));
    this.typingTimers.delete(userId);
    if (this.typing().has(userId)) {
      this.typing.update((map) => {
        const copy = new Map(map);
        copy.delete(userId);
        return copy;
      });
    }
  }

  private clearTyping() {
    this.typingTimers.forEach((timer) => clearTimeout(timer));
    this.typingTimers.clear();
    this.typing.set(new Map());
  }

  private dayLabel(date: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    const format = date.getFullYear() === today.getFullYear() ? 'EEEE, d MMMM' : 'd MMMM y';
    return formatDate(date, format, this.locale);
  }

  /** Follows new messages unless the reader has scrolled up to read history. */
  private scrollToBottom(force: boolean) {
    if (!force && !this.pinned) {
      return;
    }
    this.pinned = true;
    this.unseen.set(0);
    setTimeout(() => {
      const target = this.messagesScroller()?.nativeElement;
      if (target) {
        target.scrollTop = target.scrollHeight;
      }
    });
  }
}

function sameGroup(a: ShownMessage, b: ShownMessage): boolean {
  const gap = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return (
    a.sender?.Id === b.sender?.Id &&
    gap < GROUP_WINDOW_MS &&
    new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString()
  );
}
