import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, map, of, Subscription, switchMap, tap } from 'rxjs';
import { Chat } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  ISignOnService,
  SignOnToken,
} from 'src/app/public/services/iservices/sign-on.service.interface';
import { chatPartner, chatTitle } from '../../helpers/chat-display';
import { IconComponent } from '../../../shared/icon/icon.component';
import { NgClass } from '@angular/common';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { TonePipe, InitialsPipe } from '../../../shared/pipes/avatar.pipes';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';

type Result = { kind: 'chat'; chat: Chat } | { kind: 'notes' } | { kind: 'person'; user: IUser };

/**
 * The sidebar's one search box: filters your chats and finds people by username.
 * Picking a person opens a chat with them; nothing is created until the first message.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-chat-search',
    templateUrl: './chat-search.component.html',
    styleUrls: ['./chat-search.component.scss'],
    imports: [
    IconComponent,
    FormsModule,
    ReactiveFormsModule,
    AvatarComponent,
    NgClass,
    TonePipe,
    InitialsPipe,
    DisplayNamePipe
],
})
export class ChatSearchComponent implements OnInit, OnDestroy {
  private signOnService = inject<ISignOnService>(SignOnToken);

  readonly chats = input<Chat[]>([]);
  readonly me = input<IUser>({});
  readonly onlineIds = input<Set<number> | null>(null);
  readonly openChat = output<Chat>();
  readonly openPerson = output<IUser>();
  /** Notes to self, before its first note (once it exists, it's one of the chats). */
  readonly openNotes = output<void>();
  readonly activeChange = output<boolean>();
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  query = new FormControl<string>('', { nonNullable: true });
  readonly term = signal('');
  private readonly people = signal<IUser[]>([]);
  readonly searching = signal(false);
  readonly failed = signal(false);
  readonly active = signal(0);
  private subscription: Subscription;

  readonly matchingChats = computed(() => {
    const needle = this.term().toLowerCase();
    if (!needle) {
      return [];
    }
    return this.chats()
      .filter((chat) =>
        [this.title(chat), chatPartner(chat, this.me())?.username ?? '']
          .some((text) => text.toLowerCase().includes(needle))
      )
      .slice(0, 5);
  });

  /** People not already shown as one of your direct chats above. */
  readonly newPeople = computed(() => {
    const shown = new Set(
      this.matchingChats().map((chat) => chatPartner(chat, this.me())?.Id).filter(Boolean),
    );
    return this.people().filter((user) => !shown.has(user.Id));
  });

  /** Offer Notes to self when the query names it and it isn't a chat yet. */
  readonly notesDraft = computed(() => {
    const needle = this.term().toLowerCase();
    return (
      needle.length > 1 &&
      'notes to self'.includes(needle) &&
      !this.chats().some((chat) => chat.kind === 'self')
    );
  });

  /** Where the people start in the keyboard order. */
  readonly notesOffset = computed(() => this.matchingChats().length + (this.notesDraft() ? 1 : 0));

  readonly results = computed<Result[]>(() => [
    ...this.matchingChats().map((chat) => ({ kind: 'chat' as const, chat })),
    ...(this.notesDraft() ? [{ kind: 'notes' as const }] : []),
    ...this.newPeople().map((user) => ({ kind: 'person' as const, user })),
  ]);

  ngOnInit(): void {
    this.subscription = this.query.valueChanges
      .pipe(
        map((value) => value.trim()),
        tap((value) => {
          const wasActive = !!this.term();
          this.term.set(value);
          this.active.set(0);
          this.searching.set(!!value);
          this.failed.set(false);
          if (!value) {
            this.people.set([]);
          }
          if (wasActive !== !!value) {
            this.activeChange.emit(!!value);
          }
        }),
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((term) =>
          term
            ? this.signOnService.searchUsers(term).pipe(
                map((users) => ({ term, users, failed: false })),
                catchError(() => of({ term, users: [] as IUser[], failed: true }))
              )
            : of({ term, users: [] as IUser[], failed: false })
        )
      )
      .subscribe(({ term, users, failed }) => {
        if (term !== this.term()) {
          return;
        }
        this.people.set(users);
        this.failed.set(failed);
        this.searching.set(false);
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  title(chat: Chat): string {
    return chatTitle(chat, this.me());
  }

  partner(chat: Chat): IUser | undefined {
    return chatPartner(chat, this.me());
  }

  focus() {
    this.input()?.nativeElement.focus();
  }

  clear() {
    this.query.setValue('');
  }

  onKeydown(event: KeyboardEvent) {
    const results = this.results();
    const count = results.length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active.update((i) => (i + 1) % count);
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active.update((i) => (i - 1 + count) % count);
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.choose(results[Math.min(this.active(), count - 1)]);
    } else if (event.key === 'Escape') {
      this.clear();
    }
  }

  choose(result: Result) {
    if (result.kind === 'chat') {
      this.openChat.emit(result.chat);
    } else if (result.kind === 'notes') {
      this.openNotes.emit();
    } else {
      this.openPerson.emit(result.user);
    }
    this.clear();
  }

  pickChat(chat: Chat) {
    this.choose({ kind: 'chat', chat });
  }

  pickNotes() {
    this.choose({ kind: 'notes' });
  }

  pickPerson(user: IUser) {
    this.choose({ kind: 'person', user });
  }
}
