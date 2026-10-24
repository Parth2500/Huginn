import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Chat, ChatStateChange, MuteFor } from 'src/app/models/chat.interface';
import { IconComponent } from 'src/app/shared/icon/icon.component';
import { isMuted, mutedForever } from '../../helpers/chat-display';

const MUTE_CHOICES: { value: Exclude<MuteFor, null>; label: string }[] = [
  { value: '8h', label: 'For 8 hours' },
  { value: '1w', label: 'For 1 week' },
  { value: 'always', label: 'Always' },
];

/**
 * A chat row's menu (ux-design.md §2.2): opened by right-click, the row's chevron, or a
 * long-press. A menu, not a dialog: arrow keys move, Esc or a click outside closes it, and focus
 * returns to the row. Clear and delete come out as choices too; the list confirms them first.
 */
@Component({
  selector: 'app-chat-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './chat-menu.component.html',
  styleUrls: ['./chat-menu.component.scss'],
  host: {
    '[style.left.px]': 'position().left',
    '[style.top.px]': 'position().top',
  },
})
export class ChatMenuComponent implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly chat = input.required<Chat>();
  /** Where it opened, in viewport pixels (the pointer, or below the chevron). */
  readonly at = input.required<{ x: number; y: number }>();
  readonly choose = output<ChatStateChange>();
  readonly close = output<void>();

  readonly muteChoices = MUTE_CHOICES;
  readonly muteOpen = signal(false);
  /** Kept inside the window once its size is known. */
  private readonly size = signal({ width: 0, height: 0 });

  readonly pinned = computed(() => !!this.chat().me.pinnedAt);
  readonly archived = computed(() => !!this.chat().me.archivedAt);
  readonly muted = computed(() => isMuted(this.chat()));
  readonly unread = computed(() => this.chat().unreadCount > 0 || this.chat().me.markedUnread);
  readonly mutedLabel = computed(() => {
    const until = this.chat().me.mutedUntil;
    if (!this.muted() || !until) {
      return '';
    }
    if (mutedForever(this.chat())) {
      return 'Muted';
    }
    const date = new Date(until);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return sameDay
      ? `Muted until ${time}`
      : `Muted until ${date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
  });

  readonly position = computed(() => {
    const { x, y } = this.at();
    const { width, height } = this.size();
    const margin = 8;
    return {
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    };
  });

  ngAfterViewInit() {
    const element = this.host.nativeElement;
    this.size.set({ width: element.offsetWidth, height: element.offsetHeight });
    this.items()[0]?.focus();
  }

  pick(change: ChatStateChange) {
    this.choose.emit(change);
  }

  toggleMute() {
    this.muteOpen.update((open) => !open);
    this.afterRender(() => {
      this.size.set({
        width: this.host.nativeElement.offsetWidth,
        height: this.host.nativeElement.offsetHeight,
      });
      if (this.muteOpen()) {
        this.host.nativeElement.querySelector<HTMLElement>('.sub [role=menuitem]')?.focus();
      }
    });
  }

  /** Runs once Angular has drawn the change just made (the sub-items appear or go). */
  private afterRender(run: () => void) {
    afterNextRender(run, { injector: this.injector });
  }

  @HostListener('keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(index + 1);
      case 'ArrowUp':
        return move(index - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(items.length - 1);
      case 'ArrowRight':
        if ((document.activeElement as HTMLElement)?.dataset['mute'] !== undefined && !this.muteOpen()) {
          event.preventDefault();
          this.toggleMute();
        }
        return;
      case 'ArrowLeft':
        if (this.muteOpen()) {
          event.preventDefault();
          this.muteOpen.set(false);
          this.afterRender(() =>
            this.host.nativeElement.querySelector<HTMLElement>('[data-mute]')?.focus(),
          );
        }
        return;
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        this.close.emit();
        return;
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: PointerEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close.emit();
    }
  }

  @HostListener('window:resize')
  @HostListener('window:blur')
  dismiss() {
    this.close.emit();
  }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]')];
  }
}
