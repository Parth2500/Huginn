import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  Req,
} from '@nestjs/common';
import { RequestModel } from 'src/middleware/auth.middleware';
import {
  NotificationRuleError,
  NotificationsService,
} from './notifications.service';
import { PushSender } from './push-sender';

/** This browser's Web Push subscription (architecture.md §8). Settings go through the socket. */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly sender: PushSender,
  ) {}

  /** The VAPID public key the browser subscribes with; null when Web Push is off here. */
  @Get('push-key')
  pushKey() {
    return { publicKey: this.sender.publicKey };
  }

  @Put('subscription')
  @HttpCode(204)
  async subscribe(@Req() req: RequestModel, @Body() body: unknown) {
    await this.rules(() =>
      this.notifications.subscribe(req.user.Id, req.session.id, body),
    );
  }

  @Delete('subscription')
  @HttpCode(204)
  async unsubscribe(
    @Req() req: RequestModel,
    @Body('endpoint') endpoint: unknown,
  ) {
    await this.rules(() =>
      this.notifications.unsubscribe(req.user.Id, endpoint),
    );
  }

  private async rules(run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      if (error instanceof NotificationRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
