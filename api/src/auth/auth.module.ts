import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { AUTH_PROVIDER } from './auth-provider';
import { AuthController } from './auth.controller';
import { LocalPasswordProvider } from './local-password.provider';
import { PasswordToken } from './password.service.interface';
import { PasswordService } from './password.service';
import { Session } from './session.entity';
import { SessionsService } from './sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session]), UserModule],
  controllers: [AuthController],
  providers: [
    { provide: PasswordToken, useClass: PasswordService },
    LocalPasswordProvider,
    // The one line that changes when Heimdall sign-in arrives.
    { provide: AUTH_PROVIDER, useExisting: LocalPasswordProvider },
    SessionsService,
  ],
  exports: [SessionsService],
})
export class AuthModule {}
