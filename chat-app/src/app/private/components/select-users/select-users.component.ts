import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';

@Component({
  selector: 'app-select-users',
  templateUrl: './select-users.component.html',
  styleUrls: ['./select-users.component.scss'],
})
export class SelectUsersComponent {
  @Input() users: IUser[] = [];
  @Input() me: IUser = {};
  @Input() invalid = false;
  @Input() onlineIds: Set<number> | null = null;
  @Output() addUser: EventEmitter<IUser> = new EventEmitter<IUser>();
  @Output() removeUser: EventEmitter<IUser> = new EventEmitter<IUser>();
  @Output() pendingChange = new EventEmitter<boolean>();

  get excludeIds(): (number | undefined)[] {
    return [this.me.Id, ...this.users.map((u) => u.Id)];
  }

  removeUserFromForm(user: IUser) {
    this.removeUser.emit(user);
  }

  trackUser(_: number, user: IUser) {
    return user.Id;
  }
}
