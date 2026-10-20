import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { IPublicUser } from '../entities/user.interface';

/** Lets the chat gateway hear about profile changes made over HTTP, without a module cycle. */
@Injectable()
export class UserEventsService {
  readonly profileUpdated = new Subject<IPublicUser>();
}
