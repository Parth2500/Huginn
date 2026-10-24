import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessage, MessageInfoEntry } from 'src/app/models/chat.interface';
import { AvatarComponent } from 'src/app/shared/avatar/avatar.component';
import { IconComponent } from 'src/app/shared/icon/icon.component';
import { DisplayNamePipe } from 'src/app/shared/pipes/display-name.pipe';
import { plainText } from '../../helpers/chat-display';
import { ChatService } from '../../services/chat.service';

/**
 * Message info (ux-design.md §3.6): your message at the top, then who read it, who it reached
 * and who it's still waiting for. A direct chat shows just the two times.
 */
@Component({
  selector: 'app-message-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, IconComponent, DisplayNamePipe, DatePipe],
  templateUrl: './message-info.component.html',
  styleUrls: ['./message-info.component.scss'],
  host: { '(keydown.escape)': 'close.emit()' },
})
export class MessageInfoComponent implements OnInit, AfterViewInit {
  private readonly chatService = inject(ChatService);

  readonly message = input.required<ChatMessage>();
  readonly direct = input(false);
  readonly close = output<void>();
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  readonly info = signal<{ entries: MessageInfoEntry[]; readCount: number } | null>(null);
  readonly failed = signal<string | null>(null);
  readonly text = computed(() => plainText(this.message().text ?? ''));
  readonly readers = computed(() => this.info()?.entries.filter((e) => e.read) ?? []);
  readonly reached = computed(() => this.info()?.entries.filter((e) => e.delivered && !e.read) ?? []);
  readonly waiting = computed(() => this.info()?.entries.filter((e) => !e.delivered) ?? []);
  /** Read by people whose receipts are off: counted, never named. */
  readonly unnamedReaders = computed(() => (this.info()?.readCount ?? 0) - this.readers().length);

  async ngOnInit() {
    const result = await this.chatService.messageInfo(this.message().id);
    if (typeof result === 'string') {
      this.failed.set(result);
    } else {
      this.info.set(result);
    }
  }

  ngAfterViewInit() {
    this.closeButton()?.nativeElement.focus();
  }
}
