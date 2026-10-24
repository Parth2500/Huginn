import { TestBed } from '@angular/core/testing';
import { LocalDb } from './local-db';
import { OutboxStore } from './outbox.store';

describe('OutboxStore: refused sends', () => {
  let outbox: OutboxStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalDb,
          useValue: { putOutbox: async () => undefined, deleteOutbox: async () => undefined },
        },
      ],
    });
    outbox = TestBed.inject(OutboxStore);
    outbox.restore([
      { clientMessageId: 'a', chatId: 1, text: 'first', createdAt: '2026-10-24T10:00:00Z' },
      { clientMessageId: 'b', chatId: 1, text: 'second', createdAt: '2026-10-24T10:00:01Z' },
    ]);
  });

  it('keeps a refused send, marked, and moves on to the next', () => {
    outbox.fail('a', "You're not a member of that chat.");
    expect(outbox.next()?.clientMessageId).toBe('b');
    expect(outbox.entries()[0].failed).toBe("You're not a member of that chat.");
  });

  it('tries it again on Retry, in its place', () => {
    outbox.fail('a', 'nope');
    outbox.retry('a');
    expect(outbox.next()?.clientMessageId).toBe('a');
    expect(outbox.entries()[0].failed).toBeUndefined();
  });
});
