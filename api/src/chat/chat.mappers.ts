import { toPublicUser } from 'src/user/entities/user.interface';
import { Message } from './entities/message.entity';
import { MessageDto, SystemEvent } from './chat.types';

/** How much of a quoted message travels with each reply. */
const EXCERPT_LENGTH = 140;

export function toMessageDto(message: Message): MessageDto {
  const deleted = !!message.deletedForAllAt;
  return {
    id: message.id,
    chatId: message.chatId,
    clientMessageId: message.clientMessageId,
    sender: message.sender ? toPublicUser(message.sender) : null,
    kind: message.kind,
    text: deleted || message.kind === 'system' ? null : message.body,
    system: message.kind === 'system' ? parseSystem(message.body) : null,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderId: message.replyTo.senderId,
          // A quote of a deleted message shows that, not the old text.
          excerpt: message.replyTo.deletedForAllAt
            ? null
            : message.replyTo.body.slice(0, EXCERPT_LENGTH),
        }
      : null,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted,
    deletedById: deleted ? message.deletedById : null,
  };
}

function parseSystem(body: string): SystemEvent | null {
  try {
    return JSON.parse(body) as SystemEvent;
  } catch {
    return null;
  }
}
