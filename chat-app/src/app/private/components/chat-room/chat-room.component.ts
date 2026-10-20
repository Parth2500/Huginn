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
import { personName, roomPartner, roomTitle } from '../../helpers/room-display';

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
  /** A name or photo was clicked: show that person's profile. */
  @Output() openProfile = new EventEmitter<IUser>();
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
  /** Set the moment the server creates the chat for our first message to a draft. */
  private createdRoomId: number | undefined;
  private lastTypingSent = 0;

  constructor(
    @Inject(ChatToken) private chatService: IChatService,
    @Inject(LOCALE_ID) private locale: string
  ) {}

  ngOnInit() {
    this.subscription.add(
      this.chatService.getMessages().subscribe((page) => {
        if (page.roomId !== undefined && page.roomId !== this.roomId) {
          return;
        }
        this.history = [...page.items].sort(byCreatedAt);
        this.reconcilePending();
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
        if (page.roomId !== this.roomId) {
          return;
        }
        this.prependOlder(page.items);
      })
    );
    this.subscription.add(
      this.chatService.getTyping().subscribe(({ roomId, user }) => {
        if (roomId !== this.roomId || user.Id === this.me.Id) {
          return;
        }
        clearTimeout(this.typing.get(user.Id)?.timer);
        const timer = setTimeout(() => this.typing.delete(user.Id), TYPING_TTL_MS);
        this.typing.set(user.Id, { username: personName(user), timer });
      })
    );
    this.subscription.add(
      this.chatService.getUserUpdated().subscribe((updated) => {
        // Names and photos on messages already on screen follow profile changes.
        this.history = this.history.map((m) =>
          m.user?.Id === updated.Id ? { ...m, user: { ...m.user, ...updated } } : m
        );
        if (updated.Id === this.me.Id) {
          this.me = { ...this.me, ...updated };
        }
        this.rebuild();
      })
    );
    this.subscription.add(
      this.chatService.getDirectRoomCreated().subscribe(({ room, partnerId }) => {
        // Our first message turned this draft into a real chat; the server already opened it for us.
        if (this.isDraft && this.partner?.Id === partnerId) {
          this.createdRoomId = room.id;
        }
      })
    );
  }

  ngOnChanges(changes: SimpleChanges) {
    const change = changes['chatRoom'];
    if (!change) {
      return;
    }
    const previous: IRoom | undefined = change.previousValue;
    const next: IRoom | undefined = this.chatRoom;
    if (previous?.id !== undefined && previous.id === next?.id) {
      return;
    }
    // A draft that just became a real chat keeps its messages; the server joined us already.
    if (previous && previous.id === undefined && next?.id !== undefined && next.id === this.createdRoomId) {
      return;
    }
    if (previous?.id === undefined && next?.id === undefined &&
        roomPartner(previous, this.me)?.Id === roomPartner(next, this.me)?.Id) {
      return;
    }
    if (previous?.id !== undefined) {
      this.chatService.leaveRoom(previous);
    }
    this.createdRoomId = undefined;
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
    if (next?.id !== undefined) {
      this.chatService.joinRoom(next);
    } else {
      // A draft: nothing to load until the first message is sent.
      this.loaded = true;
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
    if (this.roomId !== undefined) {
      this.chatService.leaveRoom({ id: this.roomId });
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
    const others = this.otherMembers.map((u) => personName(u));
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
    const partner = this.partner;
    if (partner) {
      const online = this.onlineIds?.has(partner.Id!) || partner.online;
      return `@${partner.username} · ${online ? 'online' : 'offline'}`;
    }
    const others = this.otherMembers.length;
    const online = this.onlineOthers.length;
    const presence = online > 0 ? `${online} of ${others} others online` : `${others + 1} members`;
    return this.chatRoom?.description ? `${this.chatRoom.description} · ${presence}` : presence;
  }

  /** In a direct chat the other person stands in for the room's avatar and name. */
  get partner(): IUser | undefined {
    return roomPartner(this.chatRoom, this.me);
  }

  get title(): string {
    return roomTitle(this.chatRoom, this.me);
  }

  /** Not saved yet: the chat is created when the first message is sent. */
  get isDraft(): boolean {
    return this.chatRoom?.id === undefined && this.createdRoomId === undefined;
  }

  /** The saved chat's id, including one just created from this draft. */
  get roomId(): number | undefined {
    return this.chatRoom?.id ?? this.createdRoomId;
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
    const directTo = this.isDraft ? this.partner?.Id : undefined;
    setTimeout(() => {
      if (this.pending.includes(pending)) {
        pending.stalled = true;
        this.rebuild();
      }
    }, STALL_MS);
    if (directTo !== undefined) {
      this.chatService.sendDirectMessage(directTo, text);
    } else {
      this.chatService.sendMessage({ text, room: { id: this.roomId } });
    }
    this.chatMessage.reset('');
    this.resizeComposer();
    this.rebuild();
    this.scrollToBottom(true);
  }

  onComposerInput() {
    this.resizeComposer();
    const now = Date.now();
    const roomId = this.roomId;
    if (roomId !== undefined && this.chatMessage.value?.trim() && now - this.lastTypingSent > TYPING_THROTTLE_MS) {
      this.lastTypingSent = now;
      this.chatService.sendTyping(roomId);
    }
  }

  loadOlder() {
    const roomId = this.roomId;
    if (this.loadingOlder || roomId === undefined) {
      return;
    }
    this.loadingOlder = true;
    this.chatService.loadOlderMessages(roomId, this.pagesLoaded);
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
    if (this.roomId === undefined || message.room?.id !== this.roomId) {
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

  /** Drops pending sends that a freshly loaded history already contains. */
  private reconcilePending() {
    for (const message of this.history) {
      if (message.user?.Id !== this.me.Id) {
        continue;
      }
      // Only a message saved around when we sent it can be the server's copy of a pending one.
      const savedAt = new Date(message.created_at ?? 0).getTime();
      const index = this.pending.findIndex(
        (p) => p.text === message.text && savedAt >= p.created_at.getTime() - 5000
      );
      if (index > -1) {
        this.pending.splice(index, 1);
      }
    }
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
