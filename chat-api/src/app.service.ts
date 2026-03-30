import { Injectable } from '@nestjs/common';
import { IAppService } from './app.service.interface';

@Injectable()
export class AppService implements IAppService {
  getHello(): object {
    return { message: 'Hello, World!' };
  }
}
