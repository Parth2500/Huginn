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
import { personName, roomPartner, roomTitle, withUpdatedUser } from '../../helpers/room-display';
import { ProfileService } from '../../services/profile.service';

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
  /** The sidebar search has a query, so it replaces the chat list. */
  searching = false;
  /** Editing your own profile in the main pane. */
  editingProfile = false;
  /** Someone's profile panel, open over the chat. */
  profileUser: IUser | null = null;
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
    private profiles: ProfileService,
    route: ActivatedRoute
  ) {
    this.creating = !!route.snapshot.data['create'];
    this.editingProfile = !!route.snapshot.data['profile'];
  }

  ngOnInit() {
    this.subscription.add(
      this.chatService.getMyRooms().subscribe((page) => this.onRooms(page.items, page.meta))
    );
    this.subscription.add(
      this.chatService.getRoomActivity().subscribe((activity) => this.onActivity(activity))
    );
    this.subscription.add(
      this.chatService.getDirectOpened().subscribe(({ partner, room }) => {
        // An existing chat opens as usual; otherwise a draft that becomes real on the first message.
        this.selectRoom(room ?? { type: 'direct', users: [this.user, partner] });
      })
    );
    this.subscription.add(
      this.chatService.getDirectRoomCreated().subscribe(({ room, partnerId }) => {
        if (room.id === undefined) {
          return;
        }
        this.knownRoomIds.add(room.id);
        this.unread.delete(room.id);
        this.updateTitle();
        if (this.rooms && !this.rooms.some((r) => r.id === room.id)) {
          this.rooms = [room, ...this.rooms];
          if (this.meta) {
            this.meta = { ...this.meta, totalItems: this.meta.totalItems + 1 };
          }
        }
        const draft = this.selectedRoom;
        if (draft && draft.id === undefined && roomPartner(draft, this.user)?.Id === partnerId) {
          this.selectedRoom = room;
        }
      })
    );
    this.subscription.add(
      this.chatService.getRoomCreated().subscribe((room) => {
        if (room.id !== undefined) {
          this.knownRoomIds.add(room.id);
        }
        this.toast.success(`Group “${room.name}” created.`);
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
    this.subscription.add(
      this.chatService.getUserUpdated().subscribe((updated) => this.onUserUpdated(updated))
    );
    // The token carries a snapshot from sign-in; the profile (photo, display name) is fetched fresh.
    this.profiles.loadMe().subscribe({ next: (me) => (this.user = { ...this.user, ...me }) });
    this.chatService.connect();
    this.chatService.emitPaginateRooms(PAGE_SIZE, 0);
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.title.setTitle(APP_TITLE);
  }

  selectRoom(room: IRoom) {
    this.creating = false;
    this.editingProfile = false;
    this.profileUser = null;
    if (room.id !== undefined) {
      this.unread.delete(room.id);
      this.updateTitle();
    }
    if (!this.isSameChat(this.selectedRoom, room)) {
      this.selectedRoom = room;
    }
  }

  /** Same saved chat, or the same not-yet-sent draft with the same person. */
  private isSameChat(a: IRoom | undefined, b: IRoom): boolean {
    if (!a) {
      return false;
    }
    if (a.id !== undefined || b.id !== undefined) {
      return a.id === b.id;
    }
    return roomPartner(a, this.user)?.Id === roomPartner(b, this.user)?.Id;
  }

  closeRoom() {
    this.selectedRoom = undefined;
  }

  openCreate() {
    this.creating = true;
    this.editingProfile = false;
    this.profileUser = null;
  }

  openProfileEditor() {
    this.editingProfile = true;
    this.creating = false;
    this.profileUser = null;
  }

  closeProfileEditor() {
    this.editingProfile = false;
    if (this.router.url.includes('profile')) {
      this.router.navigate(['/private/dashboard']);
    }
  }

  openProfile(person: IUser) {
    if (person.Id === this.user.Id) {
      this.openProfileEditor();
      return;
    }
    this.profileUser = person;
  }

  /** "Message" from someone's profile panel. */
  messageFromProfile(person: IUser) {
    this.profileUser = null;
    this.openPerson(person);
  }

  /** Whether the open chat is the direct chat with this person. */
  isChatWith(person: IUser | null): boolean {
    return !!person && roomPartner(this.selectedRoom, this.user)?.Id === person.Id;
  }

  onProfileSaved(me: IUser) {
    this.user = { ...this.user, ...me };
  }

  closeCreate() {
    this.creating = false;
    if (this.router.url.includes('create-room')) {
      this.router.navigate(['/private/dashboard']);
    }
  }

  onCreated(room: IRoom) {
    this.chatService.createRoom(room);
    this.closeCreate();
  }

  /** Open a chat with a person: their existing direct chat, or a draft until the first message. */
  openPerson(person: IUser) {
    const existing = (this.rooms ?? []).find(
      (room) => room.type === 'direct' && roomPartner(room, this.user)?.Id === person.Id
    );
    if (existing) {
      this.selectRoom(existing);
    } else if (person.Id !== undefined) {
      // The chat may exist on another page of the list; the server knows.
      this.chatService.openDirect(person.Id);
    }
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
    return others.map((u) => personName(u)).join(', ');
  }

  preview(room: IRoom): string {
    const message = room.lastMessage;
    if (!message) {
      return `No messages yet · ${this.members(room)}`;
    }
    if (message.user?.Id === this.user.Id) {
      return `You: ${message.text}`;
    }
    // In a direct chat the sender is obvious; in a group, name them.
    return room.type === 'direct' ? message.text : `${personName(message.user)}: ${message.text}`;
  }

  chatTitle(room: IRoom): string {
    return roomTitle(room, this.user);
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

  /** A direct chat shows the other person, with their presence, as its avatar. */
  directPartner(room: IRoom): IUser | undefined {
    return roomPartner(room, this.user);
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
    const fromMe = message.user?.Id === this.user.Id;
    const index = this.rooms.findIndex((room) => room.id === roomId);
    const draft = this.selectedRoom;
    if (index === -1 && draft && draft.id === undefined && !fromMe &&
        roomPartner(draft, this.user)?.Id === message.user?.Id) {
      // They wrote first while we had a draft open with them: swap the draft for the real chat.
      this.chatService.openDirect(message.user!.Id!);
      this.chatService.emitPaginateRooms(PAGE_SIZE, 0);
      return;
    }
    if (index === -1) {
      // A chat we don't have yet (someone's first message to us) or one on another page:
      // count it, and a fresh first page brings it to the top.
      if (!fromMe && this.selectedRoom?.id !== roomId) {
        this.unread.set(roomId, (this.unread.get(roomId) ?? 0) + 1);
        this.updateTitle();
      }
      if (this.meta?.currentPage === 0) {
        this.chatService.emitPaginateRooms(PAGE_SIZE, 0);
      }
      return;
    }
    const room: IRoom = { ...this.rooms[index], lastMessage: message as IMessage };
    const rest = this.rooms.filter((_, i) => i !== index);
    this.rooms = this.meta?.currentPage === 0 ? [room, ...rest] : this.rooms.map((r, i) => (i === index ? room : r));

    if (!fromMe && this.selectedRoom?.id !== roomId) {
      this.unread.set(roomId, (this.unread.get(roomId) ?? 0) + 1);
      this.updateTitle();
    }
  }

  /** A name, photo or bio changed: update every copy we hold. */
  private onUserUpdated(updated: IUser) {
    if (updated.Id === this.user.Id) {
      this.user = { ...this.user, ...updated };
    }
    this.rooms = this.rooms?.map((room) => withUpdatedUser(room, updated)) ?? null;
    if (this.selectedRoom) {
      this.selectedRoom = withUpdatedUser(this.selectedRoom, updated);
    }
    if (this.profileUser?.Id === updated.Id) {
      this.profileUser = { ...this.profileUser, ...updated };
    }
  }

  private markFresh(room: IRoom) {
    const id = room.id as number;
    this.freshRoomIds.add(id);
    setTimeout(() => this.freshRoomIds.delete(id), 2400);
    // A new direct chat announces itself with its unread badge; groups say who added you.
    if (room.type !== 'direct') {
      this.toast.show(`You were added to the group “${room.name}”.`);
    }
  }

  private updateTitle() {
    const total = [...this.unread.values()].reduce((sum, n) => sum + n, 0);
    this.title.setTitle(total > 0 ? `(${total}) ${APP_TITLE}` : APP_TITLE);
  }
}
