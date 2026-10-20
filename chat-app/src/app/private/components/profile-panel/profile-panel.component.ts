import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  ViewChild,
} from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { ProfileService } from '../../services/profile.service';

/** Another person's profile: photo, names, bio, presence and when they joined. */
@Component({
  selector: 'app-profile-panel',
  templateUrl: './profile-panel.component.html',
  styleUrls: ['./profile-panel.component.scss'],
})
export class ProfilePanelComponent implements OnChanges, AfterViewInit {
  /** What we already know (from the chat); refreshed from the server on open. */
  @Input() person: IUser;
  @Input() me: IUser = {};
  @Input() online = false;
  /** Hide "Message" when the panel was opened from the chat with this person. */
  @Input() inChatWith = false;
  @Output() close = new EventEmitter<void>();
  @Output() message = new EventEmitter<IUser>();
  @ViewChild('closeButton') private closeButton: ElementRef<HTMLButtonElement>;

  profile: IUser | null = null;
  failed = false;

  constructor(private profiles: ProfileService) {}

  get shown(): IUser {
    return this.profile ?? this.person;
  }

  get isMe(): boolean {
    return this.person?.Id === this.me.Id;
  }

  ngOnChanges(): void {
    this.profile = null;
    this.failed = false;
    if (this.person?.Id === undefined) {
      return;
    }
    const id = this.person.Id;
    this.profiles.getProfile(id).subscribe({
      next: (profile) => {
        if (this.person?.Id === id) {
          this.profile = profile;
        }
      },
      error: () => (this.failed = true),
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.closeButton?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close.emit();
  }

  joined(): string | null {
    const raw = this.shown?.created_at;
    return raw ? new Date(raw).toLocaleDateString([], { month: 'long', year: 'numeric' }) : null;
  }
}
