import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrivateRoutingModule } from './private-routing.module';
import { DashboardComponent } from './containers/dashboard/dashboard.component';
import { ChatToken } from './services/iservices/chat.service.interface';
import { ChatService } from './services/chat.service';
import { ReactiveFormsModule } from '@angular/forms';

import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { ChatMessageComponent } from './components/chat-message/chat-message.component';
import { ChatRoomComponent } from './components/chat-room/chat-room.component';
import { CreateRoomComponent } from './components/create-room/create-room.component';
import { SelectUsersComponent } from './components/select-users/select-users.component';
import { PublicModule } from '../public/public.module';

const MaterialImports = [
  MatListModule,
  MatPaginatorModule,
  MatCardModule,
  MatButtonModule,
  MatFormFieldModule,
  MatInputModule,
  MatChipsModule,
  MatAutocompleteModule,
  MatIconModule,
];

@NgModule({
  declarations: [
    DashboardComponent,
    ChatMessageComponent,
    ChatRoomComponent,
    CreateRoomComponent,
    SelectUsersComponent,
  ],
  imports: [
    PrivateRoutingModule,
    ReactiveFormsModule,
    ...MaterialImports,
    CommonModule,
    PublicModule
  ],
  providers: [{ provide: ChatToken, useClass: ChatService }],
})
export class PrivateModule {}
