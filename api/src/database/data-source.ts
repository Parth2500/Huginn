import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConnectedUser } from '../chat/entities/connected-user/connected-user.entity';
import { JoinedRoom } from '../chat/entities/joined-room/joined-room.entity';
import { Message } from '../chat/entities/message/message.entity';
import { Room } from '../chat/entities/room/room.entity';
import { User } from '../user/entities/user.entity';
import { InitialSchema1792524417068 } from './migrations/1792524417068-InitialSchema';
import { SearchAndHistoryIndexes1792524417069 } from './migrations/1792524417069-SearchAndHistoryIndexes';

/**
 * One database configuration for the app and the TypeORM CLI. Schema changes go through
 * migrations in ./migrations; `synchronize` stays off so nothing changes the schema implicitly.
 * Migrations are listed explicitly (add new ones here after `npm run migration:generate`), which
 * also lets the test runner load them without a file glob.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Room, Message, JoinedRoom, ConnectedUser],
  migrations: [
    InitialSchema1792524417068,
    SearchAndHistoryIndexes1792524417069,
  ],
  migrationsRun: true,
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
