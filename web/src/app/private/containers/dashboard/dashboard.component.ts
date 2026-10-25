import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Chat, DraftChat, OpenChat } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import { AuthService } from 'src/app/core/auth.service';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { LogoComponent } from 'src/app/shared/logo/logo.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';
import { ChatListComponent } from '../../components/chat-list/chat-list.component';
import { ChatRoomComponent } from '../../components/chat-room/chat-room.component';
import { ChatSearchComponent } from '../../components/chat-search/chat-search.component';
import { CreateRoomComponent, NewGroup } from '../../components/create-room/create-room.component';
import { ProfileEditComponent } from '../../components/profile-edit/profile-edit.component';
import { ProfilePanelComponent } from '../../components/profile-panel/profile-panel.component';
import { StartChatComponent } from '../../components/start-chat/start-chat.component';
import { chatPartner, isHidden } from '../../helpers/chat-display';
import { ChatService } from '../../services/chat.service';
import { ChatsStore } from '../../state/chats.store';

const APP_TITLE = 'Huginn';

/** What the chat pane shows: a saved chat by id, or a draft with a person. */
type Selection = { chatId: number } | { draft: IUser } | null;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LogoComponent,
    ChatListComponent,
    IconComponent,
    ChatSearchComponent,
    AvatarComponent,
    ProfileEditComponent,
    CreateRoomComponent,
    ChatRoomComponent,
    StartChatComponent,
    ProfilePanelComponent,
    DisplayNamePipe,
  ],
})
export class DashboardComponent {
  private chatService = inject(ChatService);
  private store = inject(ChatsStore);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private title = inject(Title);

  // The route guard has checked the session, so someone is signed in.
  readonly user = signal<IUser>(this.auth.me()!);
  readonly chats = this.store.chats;
  readonly loaded = this.store.loaded;
  readonly connection = this.chatService.connection;
  readonly onlineIds = this.chatService.onlineIds;

  readonly creating = signal(false);
  /** The sidebar search has a query, so it replaces the chat list. */
  readonly searching = signal(false);
  /** Editing your own profile in the main pane. */
  readonly editingProfile = signal(false);
  /** Someone's profile panel, open over the chat. */
  readonly profileUser = signal<IUser | null>(null);

  private readonly selection = signal<Selection>(null);

  /**
   * The open chat. A draft turns into the real chat as soon as it exists, whether our first
   * message created it or the other person wrote first.
   */
  readonly openChat = computed<OpenChat | undefined>(() => {
    const selection = this.selection();
    if (!selection) {
      return undefined;
    }
    if ('chatId' in selection) {
      // A chat deleted here or on another device closes.
      const chat = this.store.get(selection.chatId);
      return chat && !isHidden(chat) ? chat : undefined;
    }
    const own = selection.draft.Id === this.user().Id;
    const existing = own ? this.store.selfChat() : this.store.directWith(selection.draft.Id!);
    if (existing) {
      return existing;
    }
    const draft: DraftChat = own
      ? { kind: 'self', title: null, description: null, members: [this.user()] }
      : { kind: 'direct', title: null, description: null, members: [this.user(), selection.draft] };
    return draft;
  });

  /** The chat the list highlights: the open one, unless a form covers it. */
  readonly selectedChatId = computed(() =>
    this.creating() ? undefined : (this.openChat() as Chat | undefined)?.id,
  );

  readonly detailOpen = computed(
    () => !!this.openChat() || this.creating() || this.editingProfile(),
  );

  constructor() {
    const route = inject(ActivatedRoute);
    this.creating.set(!!route.snapshot.data['create']);
    this.editingProfile.set(!!route.snapshot.data['profile']);

    const destroyRef = inject(DestroyRef);
    this.chatService.notices.pipe(takeUntilDestroyed()).subscribe(({ kind, text }) =>
      kind === 'error' ? this.toast.error(text) : this.toast.show(text),
    );
    this.chatService.unauthorized.pipe(takeUntilDestroyed()).subscribe((message) => this.auth.expire(message));
    this.auth.ended.pipe(takeUntilDestroyed()).subscribe((message) => {
      this.toast.error(message);
      void this.leave();
    });
    this.chatService.userUpdated.pipe(takeUntilDestroyed()).subscribe((updated) => {
      if (updated.Id === this.user().Id) {
        this.user.update((me) => ({ ...me, ...updated }));
      }
      const shown = this.profileUser();
      if (shown?.Id === updated.Id) {
        this.profileUser.set({ ...shown, ...updated });
      }
    });

    // Unread total in the tab title.
    effect(() => {
      const total = this.store.totalUnread();
      this.title.setTitle(total > 0 ? `(${total}) ${APP_TITLE}` : APP_TITLE);
    });
    destroyRef.onDestroy(() => this.title.setTitle(APP_TITLE));

    void this.chatService.start(this.user());
  }

  selectChat(chat: Chat) {
    this.closePanels();
    this.selection.set({ chatId: chat.id });
  }

  closeChat() {
    this.selection.set(null);
  }

  openCreate() {
    this.creating.set(true);
    this.editingProfile.set(false);
    this.profileUser.set(null);
  }

  openProfileEditor() {
    this.editingProfile.set(true);
    this.creating.set(false);
    this.profileUser.set(null);
  }

  closeProfileEditor() {
    this.editingProfile.set(false);
    if (this.router.url.includes('profile')) {
      void this.router.navigate(['/private/dashboard']);
    }
  }

  openProfile(person: IUser) {
    if (person.Id === this.user().Id) {
      this.openProfileEditor();
      return;
    }
    this.profileUser.set(person);
  }

  /** "Message" from someone's profile panel. */
  messageFromProfile(person: IUser) {
    this.profileUser.set(null);
    void this.openPerson(person);
  }

  /** Whether the open chat is the direct chat with this person. */
  isChatWith(person: IUser | null): boolean {
    return !!person && chatPartner(this.openChat(), this.user())?.Id === person.Id;
  }

  onProfileSaved(me: IUser) {
    this.user.update((u) => ({ ...u, ...me }));
  }

  closeCreate() {
    this.creating.set(false);
    if (this.router.url.includes('create-room')) {
      void this.router.navigate(['/private/dashboard']);
    }
  }

  async onCreated(group: NewGroup) {
    const chat = await this.chatService.createGroup(group);
    if (chat) {
      this.toast.success(`Group “${chat.title}” created.`);
      this.closeCreate();
      this.selectChat(chat);
    }
  }

  /** Open a chat with a person: their existing direct chat, or a draft until the first message. */
  async openPerson(person: IUser) {
    if (person.Id === undefined) {
      return;
    }
    this.closePanels();
    if (person.Id === this.user().Id) {
      // Notes to self: the chat, or a draft until the first note.
      const own = this.store.selfChat();
      this.selection.set(own ? { chatId: own.id } : { draft: this.user() });
      return;
    }
    const found = await this.chatService.findDirect(person.Id);
    if (!found) {
      return;
    }
    this.selection.set(found.chat ? { chatId: found.chat.id } : { draft: found.partner });
  }

  async logout() {
    const { provider, redirectTo } = await this.auth.logout();
    if (redirectTo) {
      // Heimdall ends its own session, then sends the browser back to the sign-in page.
      await this.chatService.signOut();
      window.location.assign(redirectTo);
      return;
    }
    await this.leave(provider === 'heimdall' ? { signedOut: 'heimdall-kept' } : {});
  }

  /** Signed out here or elsewhere: this account's data leaves the device. */
  private async leave(queryParams: Record<string, string> = {}) {
    await this.chatService.signOut();
    void this.router.navigate(['/public/login'], { queryParams });
  }

  private closePanels() {
    this.creating.set(false);
    this.editingProfile.set(false);
    this.profileUser.set(null);
  }
}
