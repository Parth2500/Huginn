import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';
import { IconComponent } from '../../../shared/icon/icon.component';
import { PeopleSearchComponent } from '../people-search/people-search.component';

/** The empty detail pane: find a person and start a room with them, plus how the demo works. */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-start-chat',
    templateUrl: './start-chat.component.html',
    styleUrls: ['./start-chat.component.scss'],
    imports: [IconComponent, PeopleSearchComponent],
})
export class StartChatComponent {
  readonly me = input<IUser>({});
  readonly hasRooms = input(false);
  readonly onlineIds = input<Set<number> | null>(null);
  readonly pick = output<IUser>();
}
