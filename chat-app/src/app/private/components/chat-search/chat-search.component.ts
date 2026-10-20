import {
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, map, of, Subscription, switchMap, tap } from 'rxjs';
import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  ISignOnService,
  SignOnToken,
} from 'src/app/public/services/iservices/sign-on.service.interface';
import { roomPartner, roomTitle } from '../../helpers/room-display';

type Result = { kind: 'chat'; room: IRoom } | { kind: 'person'; user: IUser };

/**
 * The sidebar's one search box: filters your chats and finds people by username.
 * Picking a person opens a chat with them; nothing is created until the first message.
 */
@Component({
  selector: 'app-chat-search',
  templateUrl: './chat-search.component.html',
  styleUrls: ['./chat-search.component.scss'],
})
export class ChatSearchComponent implements OnInit, OnDestroy {
  @Input() rooms: IRoom[] | null = null;
  @Input() me: IUser = {};
  @Input() onlineIds: Set<number> | null = null;
  @Output() openRoom = new EventEmitter<IRoom>();
  @Output() openPerson = new EventEmitter<IUser>();
  @Output() activeChange = new EventEmitter<boolean>();
  @ViewChild('input') private input: ElementRef<HTMLInputElement>;

  query = new FormControl<string>('', { nonNullable: true });
  term = '';
  people: IUser[] = [];
  searching = false;
  failed = false;
  active = 0;
  private subscription: Subscription;

  constructor(@Inject(SignOnToken) private signOnService: ISignOnService) {}

  get chats(): IRoom[] {
    const needle = this.term.toLowerCase();
    if (!needle) {
      return [];
    }
    return (this.rooms ?? [])
      .filter((room) =>
        [this.title(room), roomPartner(room, this.me)?.username ?? '']
          .some((text) => text.toLowerCase().includes(needle))
      )
      .slice(0, 5);
  }

  /** People not already shown as one of your direct chats above. */
  get newPeople(): IUser[] {
    const shown = new Set(this.chats.map((room) => roomPartner(room, this.me)?.Id).filter(Boolean));
    return this.people.filter((user) => !shown.has(user.Id));
  }

  get results(): Result[] {
    return [
      ...this.chats.map((room) => ({ kind: 'chat' as const, room })),
      ...this.newPeople.map((user) => ({ kind: 'person' as const, user })),
    ];
  }

  ngOnInit(): void {
    this.subscription = this.query.valueChanges
      .pipe(
        map((value) => value.trim()),
        tap((value) => {
          const wasActive = !!this.term;
          this.term = value;
          this.active = 0;
          this.searching = !!value;
          this.failed = false;
          if (!value) {
            this.people = [];
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
        if (term !== this.term) {
          return;
        }
        this.people = users;
        this.failed = failed;
        this.searching = false;
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  title(room: IRoom): string {
    return roomTitle(room, this.me);
  }

  partner(room: IRoom): IUser | undefined {
    return roomPartner(room, this.me);
  }

  focus() {
    this.input?.nativeElement.focus();
  }

  clear() {
    this.query.setValue('');
  }

  onKeydown(event: KeyboardEvent) {
    const count = this.results.length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active = (this.active + 1) % count;
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active = (this.active - 1 + count) % count;
    } else if (event.key === 'Enter' && count) {
      event.preventDefault();
      this.choose(this.results[Math.min(this.active, count - 1)]);
    } else if (event.key === 'Escape') {
      this.clear();
    }
  }

  choose(result: Result) {
    if (result.kind === 'chat') {
      this.openRoom.emit(result.room);
    } else {
      this.openPerson.emit(result.user);
    }
    this.clear();
  }

  pickChat(room: IRoom) {
    this.choose({ kind: 'chat', room });
  }

  pickPerson(user: IUser) {
    this.choose({ kind: 'person', user });
  }
}
