import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import { personName, roomPartner, roomTitle, withUpdatedUser } from './room-display';

describe('room display helpers', () => {
  const me: IUser = { Id: 1, username: 'maya' };
  const sam: IUser = { Id: 2, username: 'sam', displayName: 'Sam Rivera' };
  const direct: IRoom = { id: 9, type: 'direct', users: [me, sam] };
  const group: IRoom = { id: 10, type: 'group', name: 'Launch crew', users: [me, sam, { Id: 3, username: 'tess' }] };

  it('titles a direct chat with the other person, and a group with its name', () => {
    expect(roomPartner(direct, me)).toBe(sam);
    expect(roomTitle(direct, me)).toBe('Sam Rivera');
    expect(roomPartner(group, me)).toBeUndefined();
    expect(roomTitle(group, me)).toBe('Launch crew');
  });

  it('falls back from display name to username', () => {
    expect(personName({ username: 'tess' })).toBe('tess');
    expect(personName(undefined)).toBe('Someone');
  });

  it('applies a profile update to members and the last message', () => {
    const room: IRoom = { ...direct, lastMessage: { text: 'hi', user: sam, room: { id: 9 } } };
    const updated = withUpdatedUser(room, { Id: 2, displayName: 'Sam R.' });
    expect(updated.users?.[1].displayName).toBe('Sam R.');
    expect(updated.lastMessage?.user?.displayName).toBe('Sam R.');
    expect(room.users?.[1].displayName).toBe('Sam Rivera');
  });
});
