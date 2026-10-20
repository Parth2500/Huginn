import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { IMessage, IRoomActivity } from 'src/app/models/message.interface';
import { Meta } from 'src/app/models/meta.interface';
import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  ISignOnService,
  SignOnToken,
} from 'src/app/public/services/iservices/sign-on.service.interface';
import { ToastService } from 'src/app/shared/toast/toast.service';
import {
  ChatToken,
  ConnectionState,
  IChatService,
} from '../../services/iservices/chat.service.interface';

const PAGE_SIZE = 10;
const APP_TITLE = 'ChatApp';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  rooms: IRoom[] | null = null;
  meta: Meta | null = null;
  selectedRoom: IRoom | undefined;
  creating = false;
  /** People picked from "Start a chat", handed to the new room form. */
  startWith: IUser[] = [];
  freshRoomIds = new Set<number>();
  /** Messages received this session in rooms that weren't open. */
  unread = new Map<number, number>();
  user: IUser = this.signOnService.getLoggedInUser();
  connection$: Observable<ConnectionState> = this.chatService.getConnectionState();
  onlineIds$: Observable<Set<number>> = this.chatService.getOnlineUserIds();

  private knownRoomIds = new Set<number>();
  // True while the next rooms payload answers our own load or page request.
  private loadingPage = true;
  private subscription = new Subscription();

  constructor(
    @Inject(ChatToken) private chatService: IChatService,
    @Inject(SignOnToken) private signOnService: ISignOnService,
    private toast: ToastService,
    private router: Router,
    private title: Title,
    route: ActivatedRoute
  ) {
    this.creating = !!route.snapshot.data['create'];
  }

  ngOnInit() {
    this.subscription.add(
      this.chatService.getMyRooms().subscribe((page) => this.onRooms(page.items, page.meta))
    );
    this.subscription.add(
      this.chatService.getRoomActivity().subscribe((activity) => this.onActivity(activity))
    );
    this.subscription.add(
      this.chatService.getRoomCreated().subscribe((room) => {
        if (room.id !== undefined) {
          this.knownRoomIds.add(room.id);
        }
        this.toast.success(`Room “${room.name}” created.`);
        this.selectRoom(room);
      })
    );
    this.subscription.add(
      this.chatService.getErrors().subscribe((error) => this.toast.error(error.message))
    );
    this.subscription.add(
      this.chatService.getUnauthorized().subscribe((error) => {
        this.toast.error(error.message);
        this.logout();
      })
    );
    this.chatService.connect();
    this.chatService.emitPaginateRooms(PAGE_SIZE, 0);
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.title.setTitle(APP_TITLE);
  }

  selectRoom(room: IRoom) {
    this.creating = false;
    if (room.id !== undefined) {
      this.unread.delete(room.id);
      this.updateTitle();
    }
    if (this.selectedRoom?.id !== room.id) {
      this.selectedRoom = room;
    }
  }

  closeRoom() {
    this.selectedRoom = undefined;
  }

  openCreate(people: IUser[] = []) {
    this.startWith = people;
    this.creating = true;
  }

  closeCreate() {
    this.creating = false;
    this.startWith = [];
    if (this.router.url.includes('create-room')) {
      this.router.navigate(['/private/dashboard']);
    }
  }

  onCreated(room: IRoom) {
    this.chatService.createRoom(room);
    this.closeCreate();
  }

  startChatWith(person: IUser) {
    // Reuse an existing two-person room with them rather than making a duplicate.
    const existing = (this.rooms ?? []).find(
      (room) =>
        room.users?.length === 2 && room.users.some((u) => u.Id === person.Id)
    );
    if (existing) {
      this.selectRoom(existing);
      return;
    }
    this.openCreate([person]);
  }

  goToPage(page: number) {
    if (!this.meta || page < 0 || page >= this.meta.totalPages) {
      return;
    }
    this.loadingPage = true;
    this.chatService.emitPaginateRooms(PAGE_SIZE, page);
  }

  logout() {
    this.chatService.disconnect();
    this.signOnService.logoutUser();
    this.router.navigate(['/public/login']);
  }

  members(room: IRoom): string {
    const others = (room.users ?? []).filter((u) => u.Id !== this.user.Id);
    if (others.length === 0) {
      return 'Only you';
    }
    return others.map((u) => u.username).join(', ');
  }

  preview(room: IRoom): string {
    const message = room.lastMessage;
    if (!message) {
      return `No messages yet · ${this.members(room)}`;
    }
    const who = message.user?.Id === this.user.Id ? 'You' : message.user?.username;
    return `${who}: ${message.text}`;
  }

  /** Last activity: a time today, "Yesterday", or a short date. */
  activityLabel(room: IRoom): string {
    const raw = room.lastMessage?.created_at;
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

  othersIn(room: IRoom): IUser[] {
    return (room.users ?? []).filter((u) => u.Id !== this.user.Id);
  }

  /** A two-person room shows the other person's presence on its avatar. */
  directPartner(room: IRoom): IUser | undefined {
    const others = this.othersIn(room);
    return others.length === 1 ? others[0] : undefined;
  }

  trackRoom(_: number, room: IRoom) {
    return room.id;
  }

  private onRooms(items: IRoom[], meta: Meta) {
    const quiet = this.loadingPage;
    this.loadingPage = false;
    this.rooms = items;
    this.meta = meta;

    // Rooms that appear after the first load arrived live: someone added us.
    for (const room of items) {
      if (room.id === undefined || this.knownRoomIds.has(room.id)) {
        continue;
      }
      this.knownRoomIds.add(room.id);
      if (!quiet) {
        this.markFresh(room);
      }
    }

    // Keep the open room's object current (members can change).
    if (this.selectedRoom) {
      this.selectedRoom = items.find((r) => r.id === this.selectedRoom?.id) ?? this.selectedRoom;
    }
  }

  private onActivity({ roomId, message }: IRoomActivity) {
    if (!this.rooms) {
      return;
    }
    const index = this.rooms.findIndex((room) => room.id === roomId);
    if (index === -1) {
      // Not on this page: a fresh first page brings it to the top.
      if (this.meta?.currentPage === 0) {
        this.chatService.emitPaginateRooms(PAGE_SIZE, 0);
      }
      return;
    }
    const room: IRoom = { ...this.rooms[index], lastMessage: message as IMessage };
    const rest = this.rooms.filter((_, i) => i !== index);
    this.rooms = this.meta?.currentPage === 0 ? [room, ...rest] : this.rooms.map((r, i) => (i === index ? room : r));

    const fromMe = message.user?.Id === this.user.Id;
    if (!fromMe && this.selectedRoom?.id !== roomId) {
      this.unread.set(roomId, (this.unread.get(roomId) ?? 0) + 1);
      this.updateTitle();
    }
  }

  private markFresh(room: IRoom) {
    const id = room.id as number;
    this.freshRoomIds.add(id);
    setTimeout(() => this.freshRoomIds.delete(id), 2400);
    this.toast.show(`You were added to “${room.name}”.`);
  }

  private updateTitle() {
    const total = [...this.unread.values()].reduce((sum, n) => sum + n, 0);
    this.title.setTitle(total > 0 ? `(${total}) ${APP_TITLE}` : APP_TITLE);
  }
}
