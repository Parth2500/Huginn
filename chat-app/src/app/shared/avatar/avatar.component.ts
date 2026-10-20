import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { InitialsPipe, TonePipe } from '../pipes/avatar.pipes';

const tone = new TonePipe();
const initials = new InitialsPipe();

/** A person's avatar: their photo when they have one, otherwise initials on their tone. */
@Component({
  selector: 'app-avatar',
  template: `
    <img *ngIf="user?.avatarUrl && !broken; else initialsTemplate" [src]="user!.avatarUrl" alt=""
      loading="lazy" decoding="async" (error)="broken = true" />
    <ng-template #initialsTemplate>{{ letters }}</ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  @Input() size: 'xl' | 'lg' | '' | 'sm' | 'xs' = '';
  @Input() online = false;
  broken = false;

  @HostBinding('class') get classes(): string {
    return ['avatar', this.size, tone.transform(this.user?.Id), this.online ? 'online' : '']
      .filter(Boolean)
      .join(' ');
  }

  @HostBinding('attr.aria-hidden') readonly hidden = 'true';

  get letters(): string {
    return initials.transform(this.user?.displayName || this.user?.username);
  }
}
