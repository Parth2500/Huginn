import { AfterViewInit, Component, ElementRef, HostListener, OnChanges, inject, input, output, viewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { ProfileService } from '../../services/profile.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';


import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';

/** Another person's profile: photo, names, bio, presence and when they joined. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-profile-panel',
    templateUrl: './profile-panel.component.html',
    styleUrls: ['./profile-panel.component.scss'],
    imports: [
    IconComponent,
    AvatarComponent,
    DisplayNamePipe
],
})
export class ProfilePanelComponent implements OnChanges, AfterViewInit {
  private profiles = inject(ProfileService);
  /** Async results (searches, uploads) arrive outside an input change or event. */
  private cdr = inject(ChangeDetectorRef);

  /** What we already know (from the chat); refreshed from the server on open. */
  readonly person = input.required<IUser>();
  readonly me = input<IUser>({});
  readonly online = input(false);
  /** Hide "Message" when the panel was opened from the chat with this person. */
  readonly inChatWith = input(false);
  readonly close = output<void>();
  readonly message = output<IUser>();
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  profile: IUser | null = null;
  failed = false;

  get shown(): IUser {
    return this.profile ?? this.person();
  }

  get isMe(): boolean {
    return this.person()?.Id === this.me().Id;
  }

  ngOnChanges(): void {
    this.profile = null;
    this.failed = false;
    const person = this.person();
    if (person?.Id === undefined) {
      return;
    }
    const id = person.Id;
    this.profiles.getProfile(id).subscribe({
      next: (profile) => {
        if (this.person()?.Id === id) {
          this.profile = profile;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.closeButton()?.nativeElement.focus());
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
