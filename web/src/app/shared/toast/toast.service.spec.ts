import { vi } from 'vitest';
import { Toast, ToastService, UNDO_MS } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let shown: Toast[];

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ToastService();
    service.toasts$.subscribe((toasts) => (shown = toasts));
  });
  afterEach(() => vi.useRealTimers());

  it('offers Undo for five seconds, and running it dismisses the toast', () => {
    const undo = vi.fn();
    service.undoable('Chat archived.', undo);
    expect(shown[0].action?.label).toBe('Undo');

    service.act(shown[0]);
    expect(undo).toHaveBeenCalledOnce();
    expect(shown).toEqual([]);

    service.undoable('Chat archived.', undo);
    vi.advanceTimersByTime(UNDO_MS);
    expect(shown).toEqual([]);
  });

  it('pauses while held, and keeps the time that was left', () => {
    service.undoable('Chat archived.', () => undefined);
    const id = shown[0].id;
    vi.advanceTimersByTime(3000);
    service.hold(id);
    service.hold(id); // pointer and focus both: still one pause
    vi.advanceTimersByTime(60_000);
    expect(shown.length).toBe(1);

    service.release(id);
    vi.advanceTimersByTime(1900);
    expect(shown.length).toBe(1);
    vi.advanceTimersByTime(100);
    expect(shown).toEqual([]);
  });

  it('keeps the three newest', () => {
    ['a', 'b', 'c', 'd'].forEach((text) => service.show(text));
    expect(shown.map((t) => t.text)).toEqual(['b', 'c', 'd']);
  });
});
