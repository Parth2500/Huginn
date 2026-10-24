import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { User } from 'src/user/entities/user.entity';
import { UserModule } from 'src/user/user.module';
import { ChatGateway } from './chat.gateway';
import { ChatsService } from './chats.service';
import { Block } from './entities/block.entity';
import { ChatMember } from './entities/chat-member.entity';
import { Chat } from './entities/chat.entity';
import { MessageHidden } from './entities/message-hidden.entity';
import { Message } from './entities/message.entity';
import { WatermarkLog } from './entities/watermark-log.entity';
import { UserUpdate } from './entities/user-update.entity';
import { MessagesService } from './messages.service';
import { UpdatesService } from './updates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chat,
      ChatMember,
      Message,
      MessageHidden,
      Block,
      UserUpdate,
      WatermarkLog,
      User,
    ]),
    AuthModule,
    UserModule,
  ],
  providers: [ChatGateway, ChatsService, MessagesService, UpdatesService],
})
export class ChatModule {}
