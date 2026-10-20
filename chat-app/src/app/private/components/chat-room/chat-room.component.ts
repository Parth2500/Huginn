import { formatDate } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  LOCALE_ID,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { IMessage } from 'src/app/models/message.interface';
import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  ChatToken,
  ConnectionState,
  IChatService,
} from '../../services/iservices/chat.service.interface';

/** Consecutive messages from one person within this window share a bubble group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** A send with no server echo after this long is flagged as not confirmed. */
const STALL_MS = 10 * 1000;
/** Within this distance of the bottom, the stream follows new content. */
const PIN_THRESHOLD_PX = 160;
/** How long a "typing" ping keeps someone listed as typing. */
const TYPING_TTL_MS = 3500;
/** Minimum gap between our own typing pings. */
const TYPING_THROTTLE_MS = 2000;

interface PendingMessage {
  tempId: number;
  text: string;
  created_at: Date;
  stalled: boolean;
}

export type MessageStatus = 'pending' | 'stalled' | 'sent' | null;

export type StreamRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: IMessage;
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
})
export class ChatRoomComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() chatRoom: IRoom;
  @Input() me: IUser = {};
  @Input() connection: ConnectionState = 'connecting';
  @Input() onlineIds: Set<number> | null = null;
  @Output() back = new EventEmitter<void>();
  @ViewChild('messages') private messagesScroller: ElementRef<HTMLElement>;
  @ViewChild('composer') private composer: ElementRef<HTMLTextAreaElement>;

  chatMessage: FormControl<string | null> = new FormControl('');

  loaded = false;
  total = 0;
  rows: StreamRow[] = [];
  /** Messages from others that arrived while the reader was scrolled up. */
  unseen = 0;
  loadingOlder = false;
  /** Who is typing right now, by user id. */
  typing = new Map<number, { username: string; timer: ReturnType<typeof setTimeout> }>();

  private history: IMessage[] = [];
  private pending: PendingMessage[] = [];
  private freshIds = new Set<number>();
  private nextTempId = -1;
  private subscription = new Subscription();
  private pinned = true;
  private resizeObserver?: ResizeObserver;
  private pagesLoaded = 1;
  private lastTypingSent = 0;

  constructor(
    @Inject(ChatToken) private chatService: IChatService,
    @Inject(LOCALE_ID) private locale: string
  ) {}

  ngOnInit() {
    this.subscription.add(
      this.chatService.getMessages().subscribe((page) => {
        if (page.roomId !== undefined && page.roomId !== this.chatRoom?.id) {
          return;
        }
        this.history = [...page.items].sort(byCreatedAt);
        this.total = page.meta.totalItems;
        this.loaded = true;
        this.rebuild();
        this.scrollToBottom(true);
      })
    );
    this.subscription.add(
      this.chatService.getAddedMessage().subscribe((message) => this.onAdded(message))
    );
    this.subscription.add(
      this.chatService.getOlderMessages().subscribe((page) => {
        if (page.roomId !== this.chatRoom?.id) {
          return;
        }
        this.prependOlder(page.items);
      })
    );
    this.subscription.add(
      this.chatService.getTyping().subscribe(({ roomId, user }) => {
        if (roomId !== this.chatRoom?.id || user.Id === this.me.Id) {
          return;
        }
        clearTimeout(this.typing.get(user.Id)?.timer);
        const timer = setTimeout(() => this.typing.delete(user.Id), TYPING_TTL_MS);
        this.typing.set(user.Id, { username: user.username, timer });
      })
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    const change = changes['chatRoom'];
    if (!change) {
      return;
    }
    const previous: IRoom | undefined = change.previousValue;
    if (previous?.id === this.chatRoom?.id) {
      return;
    }
    if (previous) {
      this.chatService.leaveRoom(previous);
    }
    this.history = [];
    this.pending = [];
    this.freshIds.clear();
    this.loaded = false;
    this.total = 0;
    this.rows = [];
    this.unseen = 0;
    this.pinned = true;
    this.pagesLoaded = 1;
    this.loadingOlder = false;
    this.clearTyping();
    this.chatMessage.reset('');
    if (this.chatRoom) {
      this.chatService.joinRoom(this.chatRoom);
    }
  }

  ngAfterViewInit() {
    const el = this.messagesScroller?.nativeElement;
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
    // On wide screens the composer is ready for typing as soon as a room opens.
    if (window.matchMedia('(min-width: 768px)').matches) {
      setTimeout(() => this.composer?.nativeElement.focus());
    }
  }

  ngOnDestroy() {
    this.clearTyping();
    this.resizeObserver?.disconnect();
    this.subscription.unsubscribe();
    if (this.chatRoom) {
      this.chatService.leaveRoom(this.chatRoom);
    }
  }

  get canSend(): boolean {
    return !!this.chatMessage.value?.trim();
  }

  get truncated(): boolean {
    return this.loaded && this.total > this.history.length;
  }

  get shownCount(): number {
    return this.history.length;
  }

  get membersLabel(): string {
    const others = this.otherMembers.map((u) => u.username);
    return others.length ? `Members: you, ${others.join(', ')}` : 'Members: only you';
  }

  get onlineOthers(): IUser[] {
    return this.otherMembers.filter((u) => this.onlineIds?.has(u.Id!));
  }

  /** "maya is typing…", "maya and sam are typing…", or "3 people are typing…". */
  get typingLabel(): string | null {
    const names = [...this.typing.values()].map((t) => t.username);
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
  }

  get statusLine(): string {
    const others = this.otherMembers.length;
    const online = this.onlineOthers.length;
    const presence =
      others === 1
        ? online ? `${this.otherMembers[0].username} is online` : `${this.otherMembers[0].username} is offline`
        : online > 0 ? `${online} of ${others} others online` : `${others + 1} members`;
    return this.chatRoom?.description ? `${this.chatRoom.description} · ${presence}` : presence;
  }

  /** In a two-person room the other person stands in for the room's avatar. */
  get partner(): IUser | undefined {
    const others = this.otherMembers;
    return others.length === 1 ? others[0] : undefined;
  }

  get otherMembers(): IUser[] {
    return (this.chatRoom?.users ?? []).filter((u) => u.Id !== this.me.Id);
  }

  sendMessage() {
    const text = this.chatMessage.value?.trim();
    if (!text) {
      return;
    }
    const pending: PendingMessage = { tempId: this.nextTempId--, text, created_at: new Date(), stalled: false };
    this.pending.push(pending);
    setTimeout(() => {
      if (this.pending.includes(pending)) {
        pending.stalled = true;
        this.rebuild();
      }
    }, STALL_MS);
    this.chatService.sendMessage({ text, room: this.chatRoom });
    this.chatMessage.reset('');
    this.resizeComposer();
    this.rebuild();
    this.scrollToBottom(true);
  }

  onComposerInput() {
    this.resizeComposer();
    const now = Date.now();
    if (this.chatRoom?.id !== undefined && this.chatMessage.value?.trim() && now - this.lastTypingSent > TYPING_THROTTLE_MS) {
      this.lastTypingSent = now;
      this.chatService.sendTyping(this.chatRoom.id);
    }
  }

  loadOlder() {
    if (this.loadingOlder || !this.chatRoom?.id) {
      return;
    }
    this.loadingOlder = true;
    this.chatService.loadOlderMessages(this.chatRoom.id, this.pagesLoaded);
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  resizeComposer() {
    const el = this.composer?.nativeElement;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  onStreamScroll() {
    const el = this.messagesScroller.nativeElement;
    this.pinned = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
    if (this.pinned) {
      this.unseen = 0;
    }
  }

  jumpToLatest() {
    this.unseen = 0;
    this.scrollToBottom(true);
  }

  trackRow(_: number, row: StreamRow) {
    return row.key;
  }

  private onAdded(message: IMessage) {
    if (!this.chatRoom || message.room?.id !== this.chatRoom.id) {
      return;
    }
    if (this.history.some((m) => m.id === message.id)) {
      return;
    }
    const own = message.user?.Id === this.me.Id;
    if (message.user?.Id !== undefined) {
      clearTimeout(this.typing.get(message.user.Id)?.timer);
      this.typing.delete(message.user.Id);
    }
    if (own) {
      const index = this.pending.findIndex((p) => p.text === message.text);
      if (index > -1) {
        this.pending.splice(index, 1);
      }
    } else if (message.id !== undefined) {
      const id = message.id;
      this.freshIds.add(id);
      setTimeout(() => this.freshIds.delete(id), 1000);
      if (!this.pinned) {
        this.unseen++;
      }
    }
    this.history = [...this.history, message].sort(byCreatedAt);
    this.total++;
    this.rebuild();
    this.scrollToBottom(own);
  }

  /** Adds a page of older history above, keeping the reader's place on screen. */
  private prependOlder(items: IMessage[]) {
    const el = this.messagesScroller?.nativeElement;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    const known = new Set(this.history.map((m) => m.id));
    this.history = [...items.filter((m) => !known.has(m.id)), ...this.history].sort(byCreatedAt);
    this.pagesLoaded++;
    this.loadingOlder = false;
    this.rebuild();
    setTimeout(() => {
      if (el) {
        el.scrollTop = el.scrollHeight - fromBottom;
      }
    });
  }

  private clearTyping() {
    for (const entry of this.typing.values()) {
      clearTimeout(entry.timer);
    }
    this.typing.clear();
  }

  private rebuild() {
    const entries: { message: IMessage; status: MessageStatus; key: string }[] = [
      ...this.history.map((message) => ({
        message,
        status: (message.user?.Id === this.me.Id ? 'sent' : null) as MessageStatus,
        key: `m${message.id}`,
      })),
      ...this.pending.map((p) => ({
        message: { text: p.text, room: this.chatRoom, user: this.me, created_at: p.created_at },
        status: (p.stalled ? 'stalled' : 'pending') as MessageStatus,
        key: `p${p.tempId}`,
      })),
    ];

    const rows: StreamRow[] = [];
    let lastDay = '';
    entries.forEach((entry, i) => {
      const date = new Date(entry.message.created_at ?? Date.now());
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
        own: entry.message.user?.Id === this.me.Id,
        first: !prev || !sameGroup(prev, entry.message),
        last: !next || !sameGroup(entry.message, next),
        status: entry.status,
        fresh: entry.message.id !== undefined && this.freshIds.has(entry.message.id),
      });
    });
    this.rows = rows;
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
    setTimeout(() => {
      const target = this.messagesScroller?.nativeElement;
      if (target) {
        target.scrollTop = target.scrollHeight;
      }
    });
  }
}

/** Server ids are insertion order; timestamps can tie when messages arrive in a burst. */
function byCreatedAt(a: IMessage, b: IMessage): number {
  if (a.id !== undefined && b.id !== undefined) {
    return a.id - b.id;
  }
  return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
}

function sameGroup(a: IMessage, b: IMessage): boolean {
  const gap = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  return (
    a.user?.Id === b.user?.Id &&
    gap < GROUP_WINDOW_MS &&
    new Date(a.created_at ?? 0).toDateString() === new Date(b.created_at ?? 0).toDateString()
  );
}
