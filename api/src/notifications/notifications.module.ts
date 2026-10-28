import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSender, WebPushSender } from './push-sender';
import { PushSubscription } from './push-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PushSubscription])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: PushSender, useClass: WebPushSender },
  ],
  exports: [NotificationsService, PushSender],
})
export class NotificationsModule {}
