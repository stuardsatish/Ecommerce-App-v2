/**
 * The toast emitter. It is module-level mutable state shared by every screen,
 * so the things worth pinning are the ones that leak: that unsubscribe really
 * detaches (a screen that unmounts must stop receiving), that ids are unique
 * (ToastHost keys off them), and that empty messages are dropped rather than
 * rendering a blank pill.
 */
const { toast, subscribeToToasts } = require('@/lib/toast');

describe('toast emitter', () => {
  let received;
  let unsubscribe;

  beforeEach(() => {
    received = [];
    unsubscribe = subscribeToToasts((t) => received.push(t));
  });

  afterEach(() => unsubscribe());

  it('delivers success/error/info with the right type', () => {
    toast.success('yes');
    toast.error('no');
    toast.info('fyi');
    expect(received.map((t) => [t.type, t.message])).toEqual([
      ['success', 'yes'],
      ['error', 'no'],
      ['info', 'fyi'],
    ]);
  });

  it('assigns a unique, increasing id to every toast', () => {
    toast.success('a');
    toast.success('b');
    toast.success('c');
    const ids = received.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBeGreaterThan(ids[0]);
    expect(ids[2]).toBeGreaterThan(ids[1]);
  });

  it('drops empty and nullish messages', () => {
    expect(toast.success('')).toBeUndefined();
    expect(toast.error(null)).toBeUndefined();
    expect(toast.info(undefined)).toBeUndefined();
    expect(received).toHaveLength(0);
  });

  it('coerces a non-string message', () => {
    toast.success(42);
    expect(received[0].message).toBe('42');
  });

  it('stops delivering after unsubscribe', () => {
    toast.success('before');
    unsubscribe();
    toast.success('after');
    expect(received.map((t) => t.message)).toEqual(['before']);
    unsubscribe = subscribeToToasts(() => {}); // keep afterEach safe
  });

  it('fans out to multiple subscribers', () => {
    const second = [];
    const off = subscribeToToasts((t) => second.push(t));
    toast.info('both');
    expect(received).toHaveLength(1);
    expect(second).toHaveLength(1);
    off();
  });

  it('does not leak between subscribers when one detaches', () => {
    const second = [];
    const off = subscribeToToasts((t) => second.push(t));
    off();
    toast.info('only first');
    expect(received).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});