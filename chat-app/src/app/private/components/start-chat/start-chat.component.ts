import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';

/** The empty detail pane: find a person and start a room with them, plus how the demo works. */
@Component({
  selector: 'app-start-chat',
  templateUrl: './start-chat.component.html',
  styleUrls: ['./start-chat.component.scss'],
})
export class StartChatComponent {
  @Input() me: IUser = {};
  @Input() hasRooms = false;
  @Input() onlineIds: Set<number> | null = null;
  @Output() pick = new EventEmitter<IUser>();
}
