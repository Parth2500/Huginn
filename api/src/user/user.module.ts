import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './controller/user.controller';
import { UserService } from './services/user.service';
import { UserToken } from './services/iservices/user.service.interface';
import { UserEventsService } from './services/user-events.service';

const providers = [
  { provide: UserToken, useClass: UserService },
  UserEventsService,
];

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [...providers],
  exports: [...providers],
})
export class UserModule {}
