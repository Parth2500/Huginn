import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { PeopleSearchComponent } from '../people-search/people-search.component';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';

import { IconComponent } from '../../../shared/icon/icon.component';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-select-users',
    templateUrl: './select-users.component.html',
    styleUrls: ['./select-users.component.scss'],
    imports: [
    PeopleSearchComponent,
    AvatarComponent,
    IconComponent,
    DisplayNamePipe
],
})
export class SelectUsersComponent {
  readonly users = input<IUser[]>([]);
  readonly me = input<IUser>({});
  readonly invalid = input(false);
  readonly onlineIds = input<Set<number> | null>(null);
  readonly addUser = output<IUser>();
  readonly removeUser = output<IUser>();
  readonly pendingChange = output<boolean>();

  get excludeIds(): (number | undefined)[] {
    return [this.me().Id, ...this.users().map((u) => u.Id)];
  }

  removeUserFromForm(user: IUser) {
    this.removeUser.emit(user);
  }

  trackUser(_: number, user: IUser) {
    return user.Id;
  }
}
