import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './database/data-source';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppServiceToken } from './app.service.interface';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AuthMiddleWare } from './middleware/auth.middleware';
import { OriginMiddleware } from './middleware/origin.middleware';
import { ChatModule } from './chat/chat.module';

const modules = [UserModule, AuthModule, ChatModule];

const providers = [
  { provide: AppServiceToken, useClass: AppService },
  AuthMiddleWare,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    ...modules,
  ],
  controllers: [AppController],
  providers: [...providers],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(OriginMiddleware).forRoutes('');
    consumer
      .apply(AuthMiddleWare)
      .exclude(
        { path: '/auth/register', method: RequestMethod.POST },
        { path: '/auth/login', method: RequestMethod.POST },
        { path: '/auth/logout', method: RequestMethod.POST },
        { path: '/auth/providers', method: RequestMethod.GET },
        { path: '/auth/heimdall/start', method: RequestMethod.GET },
        { path: '/auth/heimdall/callback', method: RequestMethod.GET },
        { path: '/auth/signup', method: RequestMethod.ALL },
        { path: '/users/username-available', method: RequestMethod.GET },
      )
      .forRoutes('');
  }
}
