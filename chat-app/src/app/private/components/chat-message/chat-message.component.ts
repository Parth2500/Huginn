import { Component, Inject, Input } from '@angular/core';
import { IMessage } from 'src/app/models/message.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  ISignOnService,
  SignOnToken,
} from 'src/app/public/services/iservices/sign-on.service.interface';

@Component({
  selector: 'app-chat-message',
  templateUrl: './chat-message.component.html',
  styleUrls: ['./chat-message.component.scss'],
})
export class ChatMessageComponent {
  @Input() message: IMessage;
  user: IUser = this.signOnService.getLoggedInUser();

  constructor(@Inject(SignOnToken) private signOnService: ISignOnService) {}
}
