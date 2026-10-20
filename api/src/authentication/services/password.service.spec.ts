import { firstValueFrom } from 'rxjs';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes so the stored value is not the password, and verifies it', async () => {
    const hash = await firstValueFrom(service.hashPassword('Secret#123'));
    expect(hash).not.toContain('Secret#123');
    expect(
      await firstValueFrom(service.validatePassword('Secret#123', hash)),
    ).toBe(true);
    expect(
      await firstValueFrom(service.validatePassword('secret#123', hash)),
    ).toBe(false);
  });
});
