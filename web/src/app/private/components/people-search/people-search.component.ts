import { Component, ElementRef, OnDestroy, OnInit, inject, input, output, viewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';
import { IUser } from 'src/app/models/user.interface';
import {
  ISignOnService,
  SignOnToken,
} from 'src/app/public/services/iservices/sign-on.service.interface';
import { IconComponent } from '../../../shared/icon/icon.component';

import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';

type SearchState = 'idle' | 'searching' | 'results' | 'empty' | 'error';

let nextId = 0;

/** Username search combobox: type, arrow through matches, Enter or click to pick. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-people-search',
    templateUrl: './people-search.component.html',
    styleUrls: ['./people-search.component.scss'],
    imports: [
    IconComponent,
    FormsModule,
    ReactiveFormsModule,
    AvatarComponent,
    DisplayNamePipe
],
})
export class PeopleSearchComponent implements OnInit, OnDestroy {
  private signOnService = inject<ISignOnService>(SignOnToken);
  /** Async results (searches, uploads) arrive outside an input change or event. */
  private cdr = inject(ChangeDetectorRef);

  readonly excludeIds = input<(number | undefined)[]>([]);
  readonly onlineIds = input<Set<number> | null>(null);
  readonly placeholder = input('Search people by username');
  readonly actionLabel = input('Add');
  readonly invalid = input(false);
  readonly labelledBy = input<string | null>(null);
  readonly pick = output<IUser>();
  readonly pendingChange = output<boolean>();
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  readonly uid = `people-${nextId++}`;
  query = new FormControl<string>('', { nonNullable: true });
  results: IUser[] = [];
  active = 0;
  term = '';
  private _state: SearchState = 'idle';
  private subscription: Subscription;

  get state(): SearchState {
    return this._state;
  }

  set state(value: SearchState) {
    const was = this.isPending(this._state);
    this._state = value;
    if (was !== this.isPending(value)) {
      this.pendingChange.emit(this.isPending(value));
    }
  }

  get visible(): IUser[] {
    return this.results.filter((u) => !this.excludeIds().includes(u.Id));
  }

  get open(): boolean {
    return this.state === 'results' && this.visible.length > 0;
  }

  ngOnInit(): void {
    this.subscription = this.query.valueChanges
      .pipe(
        map((value) => value.trim()),
        tap((value) => {
          this.term = value;
          this.state = value ? 'searching' : 'idle';
          if (!value) {
            this.results = [];
          }
        }),
        debounceTime(250),
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
        this.results = users;
        this.active = 0;
        this.state = !term ? 'idle' : failed ? 'error' : this.visible.length ? 'results' : 'empty';
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  focus() {
    this.input()?.nativeElement.focus();
  }

  onKeydown(event: KeyboardEvent) {
    const count = this.visible.length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      this.active = (this.active + 1) % count;
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      this.active = (this.active - 1 + count) % count;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.open) {
        this.choose(this.visible[this.active]);
      }
    } else if (event.key === 'Escape') {
      this.query.setValue('');
    }
  }

  choose(user: IUser) {
    this.pick.emit(user);
    this.query.setValue('');
    this.results = [];
    this.state = 'idle';
    this.focus();
  }

  optionId(index: number) {
    return `${this.uid}-option-${index}`;
  }

  private isPending(state: SearchState) {
    return state === 'searching' || state === 'results';
  }
}
