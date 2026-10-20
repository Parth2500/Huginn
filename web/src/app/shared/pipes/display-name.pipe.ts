import { Pipe, PipeTransform } from '@angular/core';
import { IUser } from 'src/app/models/user.interface';

/** The name to show for a person: their display name, or their username. */
@Pipe({ name: 'displayName' })
export class DisplayNamePipe implements PipeTransform {
  transform(user: IUser | null | undefined): string {
    return user?.displayName || user?.username || 'Someone';
  }
}
