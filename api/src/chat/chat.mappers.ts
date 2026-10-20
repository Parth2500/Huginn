import { toPublicUser } from 'src/user/entities/user.interface';
import { Message } from './entities/message.entity';
import { MessageDto } from './chat.types';

export function toMessageDto(message: Message): MessageDto {
  const deleted = !!message.deletedForAllAt;
  return {
    id: message.id,
    chatId: message.chatId,
    clientMessageId: message.clientMessageId,
    sender: message.sender ? toPublicUser(message.sender) : null,
    kind: message.kind,
    text: deleted ? null : message.body,
    replyTo: null,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted,
  };
}
