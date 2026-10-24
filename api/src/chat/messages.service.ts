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
/** How long after sending you can edit a message or delete it for everyone. */
export const UNSEND_WINDOW_MS = 15 * 60 * 1000;
const HISTORY_PAGE = 30;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SendInput {
  senderId: number;
  clientMessageId: string;
  text: string;
  /**
   * Exactly one of these: an existing chat, or a person (a direct chat, created on first send;
   * yourself means Notes to self).
   */
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
        if (!Number.isInteger(input.toUserId)) {
          throw new ChatRuleError("That person couldn't be found.");
        }
        if (input.toUserId === input.senderId) {
          // Writing to yourself: Notes to self.
          const own = await this.chatsService.findOrCreateSelf(
            manager,
            input.senderId,
          );
          chatId = own.chat.id;
          createdChat = own.created;
        } else {
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
      // Sending reads everything before it (the others' ticks may turn read), and a hidden
      // chat comes back for everyone.
      const receipts = await this.chatsService.withReceipts(
        manager,
        [chatId],
        async () => {
          await manager.update(
            ChatMember,
            { chatId, userId: input.senderId },
            { lastReadMessageId: saved.id, lastDeliveredMessageId: saved.id },
          );
        },
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
      entries.push(...receipts);
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

  /**
   * Delete for me (hidden on your devices only) or for everyone (product-spec.md §3.4). For
   * everyone needs every message to be your own and under 15 minutes old, unless you're an
   * admin of the group. All or nothing: one message that can't go stops the request.
   */
  async delete(
    userId: number,
    messageIds: number[],
    scope: 'me' | 'all',
  ): Promise<{ updates: Addressed[] }> {
    return this.dataSource.transaction(async (manager) => {
      const messages = await manager.find(Message, {
        where: { id: In(messageIds) },
      });
      const chatIds = [...new Set(messages.map((m) => m.chatId))];
      const members = await manager.find(ChatMember, {
        where: { userId, chatId: In(chatIds), status: 'active' },
      });
      const memberOf = new Map(members.map((m) => [m.chatId, m]));
      // Messages you can't see count as not found.
      const visible = messages.filter((m) => {
        const member = memberOf.get(m.chatId);
        return (
          member &&
          m.id > member.joinedAfterMessageId &&
          m.id > member.clearedBeforeMessageId
        );
      });
      if (visible.length !== messageIds.length) {
        throw new ChatRuleError("Some of those messages couldn't be found.");
      }
      const byChat = (list: Message[]) =>
        chatIds
          .map((chatId) => ({
            chatId,
            ids: list.filter((m) => m.chatId === chatId).map((m) => m.id),
          }))
          .filter((group) => group.ids.length > 0);

      if (scope === 'me') {
        await manager
          .createQueryBuilder()
          .insert()
          .into(MessageHidden)
          .values(visible.map((m) => ({ userId, messageId: m.id })))
          .orIgnore()
          .execute();
        return {
          updates: await this.updatesService.append(
            manager,
            byChat(visible).map(({ chatId, ids }) => ({
              userId,
              payload: {
                type: 'message.hidden' as const,
                data: { chatId, messageIds: ids },
              },
            })),
          ),
        };
      }

      const chats = await manager.find(Chat, { where: { id: In(chatIds) } });
      const now = Date.now();
      for (const m of visible) {
        const chat = chats.find((c) => c.id === m.chatId);
        const role = memberOf.get(m.chatId)?.role;
        const admin =
          chat?.kind === 'group' && (role === 'owner' || role === 'admin');
        const ownAndRecent =
          m.senderId === userId &&
          now - m.createdAt.getTime() <= UNSEND_WINDOW_MS;
        if (m.kind === 'system' || (!ownAndRecent && !admin)) {
          throw new ChatRuleError(
            m.senderId === userId
              ? 'You can delete a message for everyone only within 15 minutes of sending it. You can still delete it for yourself.'
              : "Only group admins can delete other people's messages for everyone. You can delete them for yourself.",
          );
        }
      }
      const fresh = visible.filter((m) => !m.deletedForAllAt);
      if (fresh.length > 0) {
        await manager.update(
          Message,
          { id: In(fresh.map((m) => m.id)) },
          // The content goes; the row stays as the tombstone.
          { deletedForAllAt: new Date(now), deletedById: userId, body: '' },
        );
      }
      const deleted = await manager.find(Message, {
        where: { id: In(fresh.map((m) => m.id)) },
        relations: { sender: true },
      });
      const entries: { userId: number; payload: UpdatePayload }[] = [];
      for (const chatId of chatIds) {
        const memberIds = await this.chatsService.activeMemberIds(
          chatId,
          manager,
        );
        for (const message of deleted.filter((m) => m.chatId === chatId)) {
          for (const memberId of memberIds) {
            entries.push({
              userId: memberId,
              payload: {
                type: 'message.deleted',
                data: { message: toMessageDto(message) },
              },
            });
          }
        }
      }
      return { updates: await this.updatesService.append(manager, entries) };
    });
  }

  /** Marks read: `chat.state` for the reader's own devices, `receipt` for the senders. */
  async markRead(chatId: number, userId: number, upTo: number) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const { chat, receipts } = await this.chatsService.markRead(
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
        ...receipts,
      ]);
      return { chat, updates };
    });
  }

  /** A device received a chat's messages up to `upTo`: the senders' ticks may double. */
  async markDelivered(chatId: number, userId: number, upTo: number) {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const receipts = await this.chatsService.markDelivered(
        manager,
        chatId,
        userId,
        upTo,
      );
      return { updates: await this.updatesService.append(manager, receipts) };
    });
  }
}
