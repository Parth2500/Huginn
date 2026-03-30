import { TestBed } from '@angular/core/testing';

import { SignOnService } from './sign-on.service';

describe('SignOnService', () => {
  let service: SignOnService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SignOnService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
