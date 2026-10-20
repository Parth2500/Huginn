import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './controller/user.controller';
import { UserService } from './services/user.service';
import { UserHelperService } from './services/user-helper/user-helper.service';
import { UserHelperToken } from './services/iservices/user-helper.service.interface';
import { UserToken } from './services/iservices/user.service.interface';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import { UserEventsService } from './services/user-events.service';

const modules = [AuthenticationModule];

const providers = [
  { provide: UserToken, useClass: UserService },
  { provide: UserHelperToken, useClass: UserHelperService },
  UserEventsService,
];

@Module({
  imports: [TypeOrmModule.forFeature([User]), ...modules],
  controllers: [UserController],
  providers: [...providers],
  exports: [...providers],
})
export class UserModule {}
