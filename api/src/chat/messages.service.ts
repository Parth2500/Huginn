import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { ChatMember } from './entities/chat-member.entity';
import { Chat } from './entities/chat.entity';
import { MessageHidden } from './entities/message-hidden.entity';
import { Message } from './entities/message.entity';
import { MessageDto, UpdatePayload } from './chat.types';
import { toMessageDto } from './chat.mappers';
import { ChatRuleError, ChatsService } from './chats.service';
import { Addressed, UpdatesService } from './updates.service';

export const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_PAGE = 30;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SendInput {
  senderId: number;
  clientMessageId: string;
  text: string;
  /** Exactly one of these: an existing chat, or a person (a direct chat, created on first send). */
  chatId?: number;
  toUserId?: number;
}

export interface SendResult {
  message: MessageDto;
  chatId: number;
  /** True when this send created the chat (a direct chat's first message). */
  createdChat: boolean;
  updates: Addressed[];
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly chatsService: ChatsService,
    private readonly updatesService: UpdatesService,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
  ) {}

  /**
   * Stores a message and records `message.new` for every member, in one transaction. Retrying
   * with the same clientMessageId returns the original message and records nothing new.
   */
  async send(input: SendInput): Promise<SendResult> {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      throw new ChatRuleError(
        `Messages must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    if (!UUID.test(input.clientMessageId ?? '')) {
      throw new ChatRuleError('Each message needs a clientMessageId (a UUID).');
    }

    const existing = await this.messages.findOne({
      where: {
        senderId: input.senderId,
        clientMessageId: input.clientMessageId,
      },
      relations: { sender: true },
    });
    if (existing) {
      return {
        message: toMessageDto(existing),
        chatId: existing.chatId,
        createdChat: false,
        updates: [],
      };
    }

    return this.dataSource.transaction(async (manager) => {
      let chatId = input.chatId;
      let createdChat = false;
      if (input.toUserId !== undefined) {
        if (
          !Number.isInteger(input.toUserId) ||
          input.toUserId === input.senderId
        ) {
          throw new ChatRuleError("That person couldn't be found.");
        }
        const other = await manager.findOne(User, {
          where: { Id: input.toUserId },
        });
        if (!other) {
          throw new ChatRuleError("That person couldn't be found.");
        }
        const direct = await this.chatsService.findOrCreateDirect(
          manager,
          input.senderId,
          other.Id,
        );
        chatId = direct.chat.id;
        createdChat = direct.created;
      }
      if (!Number.isInteger(chatId)) {
        throw new ChatRuleError("You're not a member of that chat.");
      }
      const memberIds = await this.chatsService.activeMemberIds(
        chatId,
        manager,
      );
      if (!memberIds.includes(input.senderId)) {
        throw new ChatRuleError("You're not a member of that chat.");
      }

      const saved = await manager.save(
        manager.create(Message, {
          chatId: chatId,
          senderId: input.senderId,
          clientMessageId: input.clientMessageId,
          kind: 'text',
          body: text,
        }),
      );
      await manager.update(
        Chat,
        { id: chatId },
        { lastMessageId: saved.id, lastActivityAt: saved.createdAt },
      );
      // Sending reads everything before it, and a hidden chat comes back for everyone.
      await manager.update(
        ChatMember,
        { chatId, userId: input.senderId },
        { lastReadMessageId: saved.id, lastDeliveredMessageId: saved.id },
      );
      await manager.update(
        ChatMember,
        { chatId, status: 'active' },
        { hiddenAt: null },
      );

      const withSender = await manager.findOneOrFail(Message, {
        where: { id: saved.id },
        relations: { sender: true },
      });
      const message = toMessageDto(withSender);

      const entries: { userId: number; payload: UpdatePayload }[] = [];
      if (createdChat) {
        entries.push(
          ...(await this.chatsService.announceNew(manager, chatId, memberIds)),
        );
      }
      for (const userId of memberIds) {
        entries.push({
          userId,
          payload: { type: 'message.new', data: { message } },
        });
      }
      const updates = await this.updatesService.append(manager, entries);
      return { message, chatId: chatId, createdChat, updates };
    });
  }

  /**
   * History, newest first, `before` a message id (keyset paging: cost doesn't grow with depth).
   * Respects the reader's join point, clear point and "delete for me".
   */
  async page(
    chatId: number,
    userId: number,
    before?: number,
  ): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
    const member = await this.dataSource.manager.findOne(ChatMember, {
      where: { chatId, userId },
    });
    if (!member) {
      throw new ChatRuleError("You're not a member of that chat.");
    }
    const floor = Math.max(
      member.clearedBeforeMessageId,
      member.joinedAfterMessageId,
    );
    const query = this.messages
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .where('m.chatId = :chatId', { chatId })
      .andWhere('m.id > :floor', { floor })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h."messageId" = m.id AND h."userId" = :userId)`,
        { userId },
      )
      .orderBy('m.id', 'DESC')
      .limit(HISTORY_PAGE + 1);
    if (before) {
      query.andWhere('m.id < :before', { before });
    }
    const rows = await query.getMany();
    return {
      messages: rows.slice(0, HISTORY_PAGE).map(toMessageDto),
      hasMore: rows.length > HISTORY_PAGE,
    };
  }

  async hiddenFor(userId: number, messageIds: number[]): Promise<Set<number>> {
    if (messageIds.length === 0) {
      return new Set();
    }
    const rows = await this.dataSource.manager.find(MessageHidden, {
      where: { userId, messageId: In(messageIds) },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  /** Marks read and records `chat.state` for the reader's own devices. */
  async markRead(chatId: number, userId: number, upTo: number) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const chat = await this.chatsService.markRead(
        manager,
        chatId,
        userId,
        upTo,
      );
      if (!chat) {
        return { chat: null, updates: [] as Addressed[] };
      }
      const updates = await this.updatesService.append(manager, [
        {
          userId,
          payload: {
            type: 'chat.state',
            data: { chatId, me: chat.me, unreadCount: chat.unreadCount },
          },
        },
      ]);
      return { chat, updates };
    });
  }
}
