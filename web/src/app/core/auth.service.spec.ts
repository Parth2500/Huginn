import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { sessionInterceptor } from './session.interceptor';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const maya = { Id: 1, username: 'maya', email: 'maya@example.com' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('asks the server once who is signed in, and never stores a token', async () => {
    const first = auth.check();
    const second = auth.check();
    http.expectOne('api/auth/session').flush(maya);
    expect(await first).toEqual(maya);
    expect(await second).toEqual(maya);
    expect(auth.me()).toEqual(maya);
    // Only the non-secret profile is remembered, for opening offline.
    expect(JSON.parse(localStorage.getItem('huginn.lastUser')!)).toEqual({ Id: 1, username: 'maya' });
  });

  it('opens from the remembered profile when the server is unreachable', async () => {
    localStorage.setItem('huginn.lastUser', JSON.stringify({ Id: 1, username: 'maya' }));
    const check = auth.check();
    http.expectOne('api/auth/session').flush(null, { status: 504, statusText: 'Gateway Timeout' });
    expect(await check).toEqual({ Id: 1, username: 'maya' });
    // ...and asks again next time instead of caching the guess.
    void auth.check();
    http.expectOne('api/auth/session').flush(maya);
  });

  it('treats 401 as signed out and forgets the remembered profile', async () => {
    localStorage.setItem('huginn.lastUser', JSON.stringify({ Id: 1 }));
    const check = auth.check();
    http.expectOne('api/auth/session').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(await check).toBeNull();
    expect(localStorage.getItem('huginn.lastUser')).toBeNull();
  });

  it('signs out on the server and here, even when offline', async () => {
    const login = auth.login({ email: 'maya@example.com', password: 'x' });
    http.expectOne('api/auth/login').flush(maya);
    await login;
    const logout = auth.logout();
    http.expectOne('api/auth/logout').error(new ProgressEvent('error'));
    await logout;
    expect(auth.me()).toBeNull();
    expect(await auth.check()).toBeNull();
  });

  it('reports a session that ended mid-use, once', async () => {
    const login = auth.login({ email: 'maya@example.com', password: 'x' });
    http.expectOne('api/auth/login').flush(maya);
    await login;
    const ended: string[] = [];
    auth.ended.subscribe((m) => ended.push(m));
    const client = TestBed.inject(HttpClient);
    for (const url of ['api/users/me', 'api/users/search']) {
      const request = firstValueFrom(client.get(url)).catch(() => undefined);
      http.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      await request;
    }
    expect(ended).toEqual(['Your session expired. Sign in again to continue.']);
    expect(auth.me()).toBeNull();
  });
});
