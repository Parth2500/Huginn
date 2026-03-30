import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtGuard } from './guards/jwt.guard';
import { AuthenticationService } from './services/authentication.service';
import { AuthenticationToken } from './services/iservices/authentication.service.interface';
import { PasswordToken } from './services/iservices/password.service.interface';
import { PasswordService } from './services/password.service';
import { JwtStrategy } from './strategies/jwt.strategy';

const providers = [
  { provide: AuthenticationToken, useClass: AuthenticationService },
  { provide: PasswordToken, useClass: PasswordService },
  JwtGuard,
  JwtStrategy,
];

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '1h', issuer: 'nest' },
      }),
    }),
  ],
  providers: [...providers],
  exports: [...providers],
})
export class AuthenticationModule {}
