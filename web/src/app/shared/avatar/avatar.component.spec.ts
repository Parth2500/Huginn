import { TestBed } from '@angular/core/testing';
import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  const render = (inputs: Record<string, unknown>) => {
    const fixture = TestBed.createComponent(AvatarComponent);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows initials on the person’s tone when there is no photo', () => {
    const el = render({ user: { Id: 2, username: 'sam', displayName: 'Sam Rivera' } });
    expect(el.textContent?.trim()).toBe('SR');
    expect(el.classList).toContain('avatar');
    expect(el.classList).toContain('tone-2');
    expect(el.querySelector('img')).toBeNull();
  });

  it('shows the photo when there is one, and the presence dot when online', () => {
    const el = render({ user: { Id: 2, username: 'sam', avatarUrl: '/api/uploads/avatars/2-a.webp' }, online: true, size: 'sm' });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/api/uploads/avatars/2-a.webp');
    expect(el.classList).toContain('online');
    expect(el.classList).toContain('sm');
  });
});
