import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { test, TestService } from './services/test/test.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'chat-app';

  testData$: Observable<test> = this.test.getTestData();

  constructor(private test: TestService) {}
}
