import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export interface test {
  message: string;
}

export const t = new InjectionToken<test>('test');

@Injectable({
  providedIn: 'root',
})
export class TestService {
  constructor(private httpClient: HttpClient) {}

  getTestData(): Observable<test> {
    return this.httpClient.get<test>('api');
  }
}
