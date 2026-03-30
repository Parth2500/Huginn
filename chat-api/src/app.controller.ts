import { Controller, Get, Inject } from '@nestjs/common';
import { AppServiceToken, IAppService } from './app.service.interface';

@Controller()
export class AppController {
  constructor(
    @Inject(AppServiceToken) private readonly appService: IAppService,
  ) {}

  @Get()
  getHello(): object {
    return this.appService.getHello();
  }
}
