import { ChangeDetectionStrategy, Component, HostBinding, Input, input } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { InitialsPipe, TonePipe } from '../pipes/avatar.pipes';



const tone = new TonePipe();
const initials = new InitialsPipe();

/** A person's avatar: their photo when they have one, otherwise initials on their tone. */
@Component({
    selector: 'app-avatar',
    template: `
    @if (user?.avatarUrl && !broken) {
      <img [src]="user!.avatarUrl" alt=""
        loading="lazy" decoding="async" (error)="broken = true" />
    } @else {
      {{ letters }}
    }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
})
export class AvatarComponent {
  private _user: IUser | null | undefined;
  @Input() set user(value: IUser | null | undefined) {
    if (value?.avatarUrl !== this._user?.avatarUrl) {
      this.broken = false;
    }
    this._user = value;
  }
  get user(): IUser | null | undefined {
    return this._user;
  }
  readonly size = input<'xl' | 'lg' | '' | 'sm' | 'xs'>('');
  readonly online = input(false);
  broken = false;

  @HostBinding('class') get classes(): string {
    return ['avatar', this.size(), tone.transform(this.user?.Id), this.online() ? 'online' : '']
      .filter(Boolean)
      .join(' ');
  }

  @HostBinding('attr.aria-hidden') readonly hidden = 'true';

  get letters(): string {
    return initials.transform(this.user?.displayName || this.user?.username);
  }
}
