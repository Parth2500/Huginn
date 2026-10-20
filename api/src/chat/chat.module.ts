import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import { UserModule } from 'src/user/user.module';
import { ConnectedUser } from './entities/connected-user/connected-user.entity';
import { JoinedRoom } from './entities/joined-room/joined-room.entity';
import { Message } from './entities/message/message.entity';
import { Room } from './entities/room/room.entity';
import { ChatGateway } from './gateway/chat/chat.gateway';
import { ConnectedUserToken } from './services/iservices/connected-user.service.interface';
import { ConnectedUserService } from './services/connected-user/connected-user.service';
import { JoinedRoomToken } from './services/iservices/joined-room.service.interface';
import { JoinedRoomService } from './services/joined-room/joined-room.service';
import { MessageToken } from './services/iservices/message.service.interface';
import { MessageService } from './services/message/message.service';
import { RoomToken } from './services/iservices/room.service.interface';
import { RoomService } from './services/room/room.service';

const modules = [AuthenticationModule, UserModule];

const providers = [
  ChatGateway,
  { provide: ConnectedUserToken, useClass: ConnectedUserService },
  { provide: JoinedRoomToken, useClass: JoinedRoomService },
  { provide: MessageToken, useClass: MessageService },
  { provide: RoomToken, useClass: RoomService },
];

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, ConnectedUser, Message, JoinedRoom]),
    ...modules,
  ],
  providers: [...providers],
})
export class ChatModule {}
