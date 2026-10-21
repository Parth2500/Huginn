import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Session } from '../auth/session.entity';
import { Block } from '../chat/entities/block.entity';
import { ChatMember } from '../chat/entities/chat-member.entity';
import { Chat } from '../chat/entities/chat.entity';
import { MessageHidden } from '../chat/entities/message-hidden.entity';
import { Message } from '../chat/entities/message.entity';
import { UserUpdate } from '../chat/entities/user-update.entity';
import { UserSettings } from '../user/entities/user-settings.entity';
import { User } from '../user/entities/user.entity';
import { InitialSchema1792524417068 } from './migrations/1792524417068-InitialSchema';
import { SearchAndHistoryIndexes1792524417069 } from './migrations/1792524417069-SearchAndHistoryIndexes';
import { ChatsAndMembers1792524417070 } from './migrations/1792524417070-ChatsAndMembers';
import { Sessions1792601612272 } from './migrations/1792601612272-Sessions';

/**
 * One database configuration for the app and the TypeORM CLI. Schema changes go through
 * migrations in ./migrations; `synchronize` stays off so nothing changes the schema implicitly.
 * Migrations are listed explicitly (add new ones here after `npm run migration:generate`), which
 * also lets the test runner load them without a file glob.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    UserSettings,
    Chat,
    ChatMember,
    Message,
    MessageHidden,
    Block,
    UserUpdate,
    Session,
  ],
  migrations: [
    InitialSchema1792524417068,
    SearchAndHistoryIndexes1792524417069,
    ChatsAndMembers1792524417070,
    Sessions1792601612272,
  ],
  // gen_random_uuid() is built into Postgres 13+, so no extension is needed for UUID keys.
  uuidExtension: 'pgcrypto',
  migrationsRun: true,
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
