import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrivateRoutingModule } from './private-routing.module';
import { DashboardComponent } from './containers/dashboard/dashboard.component';
import { ChatToken } from './services/iservices/chat.service.interface';
import { ChatService } from './services/chat.service';
import { ReactiveFormsModule } from '@angular/forms';

import { ChatMessageComponent } from './components/chat-message/chat-message.component';
import { ChatRoomComponent } from './components/chat-room/chat-room.component';
import { CreateRoomComponent } from './components/create-room/create-room.component';
import { SelectUsersComponent } from './components/select-users/select-users.component';
import { PeopleSearchComponent } from './components/people-search/people-search.component';
import { StartChatComponent } from './components/start-chat/start-chat.component';
import { ChatSearchComponent } from './components/chat-search/chat-search.component';
import { ProfilePanelComponent } from './components/profile-panel/profile-panel.component';
import { ProfileEditComponent } from './components/profile-edit/profile-edit.component';
import { PublicModule } from '../public/public.module';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [
    DashboardComponent,
    ChatMessageComponent,
    ChatRoomComponent,
    CreateRoomComponent,
    SelectUsersComponent,
    PeopleSearchComponent,
    StartChatComponent,
    ChatSearchComponent,
    ProfilePanelComponent,
    ProfileEditComponent,
  ],
  imports: [
    PrivateRoutingModule,
    ReactiveFormsModule,
    CommonModule,
    PublicModule,
    SharedModule,
  ],
  providers: [{ provide: ChatToken, useClass: ChatService }],
})
export class PrivateModule {}
