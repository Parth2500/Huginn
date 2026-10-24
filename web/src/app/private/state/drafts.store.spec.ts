import { TestBed } from '@angular/core/testing';
import { DraftsStore } from './drafts.store';
import { LocalDb } from './local-db';

describe('DraftsStore', () => {
  let drafts: DraftsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LocalDb, useValue: { setDrafts: async () => undefined } }],
    });
    drafts = TestBed.inject(DraftsStore);
  });

  it('keeps text per conversation and forgets blank text', () => {
    drafts.set('c1', 'half written');
    drafts.set('c2', '   ');
    expect(drafts.get('c1')).toBe('half written');
    expect(drafts.drafts().has('c2')).toBe(false);
    drafts.set('c1', '');
    expect(drafts.drafts().size).toBe(0);
  });

  it("follows a draft chat when it becomes a real one", () => {
    drafts.set('u7', 'first words');
    drafts.move('u7', 'c42');
    expect(drafts.get('u7')).toBe('');
    expect(drafts.get('c42')).toBe('first words');
  });
});
