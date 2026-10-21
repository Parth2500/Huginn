import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { AuthController } from './auth.controller';
import { HeimdallOidcProvider } from './heimdall-oidc.provider';
import { IdentitiesService } from './identities.service';
import { LocalPasswordProvider } from './local-password.provider';
import { PasswordToken } from './password.service.interface';
import { PasswordService } from './password.service';
import { PendingSignup } from './pending-signup.entity';
import { Session } from './session.entity';
import { SessionsService } from './sessions.service';
import { UserIdentity } from './user-identity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, UserIdentity, PendingSignup]),
    UserModule,
  ],
  controllers: [AuthController],
  providers: [
    { provide: PasswordToken, useClass: PasswordService },
    LocalPasswordProvider,
    HeimdallOidcProvider,
    IdentitiesService,
    SessionsService,
  ],
  exports: [SessionsService],
})
export class AuthModule {}
