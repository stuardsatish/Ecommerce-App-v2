/**
 * API contract tests — createReturnsService (Ecommerce-app).
 *
 * The service is specifically designed for dependency injection (`createReturnsService(client)`),
 * so we pass a mock Supabase client and verify:
 *   1. The correct RPC names are called with the correct argument shapes.
 *   2. The isReturnsUnavailable() error detection returns the right values.
 *   3. The toReturnsError() helper produces user-friendly messages for known codes.
 *   4. The uploadEvidence() rollback removes uploaded files on failure.
 *
 * NOTE: @/lib/supabase is mocked to avoid expo/virtual/env.js ESM parse error
 * (expo packages use ESM exports that the logic Jest project does not transform).
 */

// Mock @/lib/supabase BEFORE any import — prevents expo ESM parse error
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const {
  createReturnsService,
  isReturnsUnavailable,
  toReturnsError,
  EVIDENCE_BUCKET,
} = require('../../src/services/returns');

// ─────────────────────────────────────────────────────────────────────────────
// isReturnsUnavailable — detects "feature not migrated yet" errors
// ─────────────────────────────────────────────────────────────────────────────
describe('isReturnsUnavailable', () => {
  it('returns false for null error', () => {
    expect(isReturnsUnavailable(null)).toBe(false);
    expect(isReturnsUnavailable(undefined)).toBe(false);
  });

  it.each(['PGRST202', 'PGRST205', '42883', '42P01', '42703'])(
    'returns true for Postgres error code %s',
    (code) => {
      expect(isReturnsUnavailable({ code, message: 'error' })).toBe(true);
    }
  );

  it('returns true when message mentions missing return_requests function', () => {
    expect(
      isReturnsUnavailable({
        code: 'PGRST200',
        message: 'Could not find return_requests in schema cache',
      })
    ).toBe(true);
  });

  it('returns false for a generic 500 error', () => {
    expect(isReturnsUnavailable({ code: '500', message: 'Internal server error' })).toBe(false);
  });

  it('returns false for a permissions error', () => {
    expect(isReturnsUnavailable({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toReturnsError — user-friendly message mapping
// ─────────────────────────────────────────────────────────────────────────────
describe('toReturnsError', () => {
  it('wraps in an Error instance', () => {
    expect(toReturnsError({ code: '500', message: 'boom' })).toBeInstanceOf(Error);
  });

  it('returns the migration-missing message for PGRST202', () => {
    const err = toReturnsError({ code: 'PGRST202', message: 'x' });
    expect(err.message).toMatch(/not available on the server yet/i);
  });

  it('returns duplicate message for code 23505', () => {
    const err = toReturnsError({ code: '23505', message: 'x' });
    expect(err.message).toMatch(/already exists/i);
  });

  it('returns permission message for 42501', () => {
    const err = toReturnsError({ code: '42501', message: 'permission denied' });
    expect(err.message).toMatch(/permission/i);
  });

  it('passes through the original message for unknown codes', () => {
    const err = toReturnsError({ code: 'unknown', message: 'Custom error from DB' });
    expect(err.message).toBe('Custom error from DB');
  });

  it('attaches code, detail and original to the error', () => {
    const raw = { code: '42501', message: 'permission denied', details: 'some detail' };
    const err = toReturnsError(raw);
    expect(err.code).toBe('42501');
    expect(err.detail).toBe('some detail');
    expect(err.original).toBe(raw);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const mockClient = ({ rpcData = {}, rpcError = null, fromData = [], fromError = null } = {}) => {
  const fromChain = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: fromData, error: fromError }),
  };
  return {
    rpc: jest.fn().mockResolvedValue({ data: rpcData, error: rpcError }),
    from: jest.fn(() => fromChain),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        remove: jest.fn().mockResolvedValue({ error: null }),
      })),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// eligibility()
// ─────────────────────────────────────────────────────────────────────────────
describe('createReturnsService — eligibility()', () => {
  it('RT-C01 — calls get_order_eligibility RPC with p_order_id', async () => {
    const client = mockClient({ rpcData: [{ eligible: true }] });
    const svc = createReturnsService(client);
    await svc.eligibility('ord-1');
    expect(client.rpc).toHaveBeenCalledWith('get_order_eligibility', { p_order_id: 'ord-1' });
  });

  it('RT-C02 — returns null when the feature is not migrated (PGRST202)', async () => {
    const client = mockClient({ rpcError: { code: 'PGRST202', message: 'x' } });
    const svc = createReturnsService(client);
    const result = await svc.eligibility('ord-1');
    expect(result).toBeNull();
  });

  it('RT-C03 — throws toReturnsError for non-migration errors', async () => {
    const client = mockClient({ rpcError: { code: '42501', message: 'permission denied' } });
    const svc = createReturnsService(client);
    await expect(svc.eligibility('ord-1')).rejects.toThrow(/permission/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reasons()
// ─────────────────────────────────────────────────────────────────────────────
describe('createReturnsService — reasons()', () => {
  it('RT-C04 — queries request_reasons table and returns rows', async () => {
    const client = mockClient({
      fromData: [{ code: 'damaged', label: 'Damaged', active: true }],
    });
    const svc = createReturnsService(client);
    const reasons = await svc.reasons();
    expect(client.from).toHaveBeenCalledWith('request_reasons');
    expect(reasons).toHaveLength(1);
    expect(reasons[0].code).toBe('damaged');
  });

  it('RT-C05 — returns [] when feature not migrated', async () => {
    const fromChain = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: null, error: { code: '42P01', message: 'x' } }),
    };
    const client = { rpc: jest.fn(), from: jest.fn(() => fromChain), storage: { from: jest.fn() } };
    const svc = createReturnsService(client);
    const reasons = await svc.reasons();
    expect(reasons).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// submit()
// ─────────────────────────────────────────────────────────────────────────────
describe('createReturnsService — submit()', () => {
  it('RT-C06 — calls create_return_request RPC with the payload', async () => {
    const client = mockClient({
      rpcData: {
        created: true,
        request_id: 'req-1',
        request_no: 'RET-001',
        status: 'submitted',
      },
    });
    const svc = createReturnsService(client);
    const payload = { p_order_id: 'ord-1', p_items: [], p_reason_code: 'damaged' };
    const result = await svc.submit(payload);
    expect(client.rpc).toHaveBeenCalledWith('create_return_request', payload);
    expect(result.requestId).toBe('req-1');
    expect(result.requestNo).toBe('RET-001');
    expect(result.created).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cancel()
// ─────────────────────────────────────────────────────────────────────────────
describe('createReturnsService — cancel()', () => {
  it('RT-C07 — calls cancel_return_request with correct args', async () => {
    const client = mockClient({ rpcData: { already: false, status: 'cancelled' } });
    const svc = createReturnsService(client);
    const result = await svc.cancel('req-1', 'Changed my mind');
    expect(client.rpc).toHaveBeenCalledWith('cancel_return_request', {
      p_request_id: 'req-1',
      p_note: 'Changed my mind',
    });
    expect(result.status).toBe('cancelled');
  });

  it('RT-C08 — passes null note when omitted', async () => {
    const client = mockClient({ rpcData: { already: false, status: 'cancelled' } });
    const svc = createReturnsService(client);
    await svc.cancel('req-1');
    const callArgs = client.rpc.mock.calls[0][1];
    expect(callArgs.p_note).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// uploadEvidence()
// ─────────────────────────────────────────────────────────────────────────────
describe('createReturnsService — uploadEvidence()', () => {
  it('RT-C09 — uploads to the correct bucket and returns path metadata', async () => {
    const uploadMock = jest.fn().mockResolvedValue({ error: null });
    const client = {
      rpc: jest.fn(),
      from: jest.fn(),
      storage: { from: jest.fn(() => ({ upload: uploadMock, remove: jest.fn() })) },
    };
    const svc = createReturnsService(client);
    const files = [
      { name: 'photo.jpg', type: 'image/jpeg', size: 1024, body: new ArrayBuffer(8) },
    ];
    const result = await svc.uploadEvidence({ uid: 'u1', requestId: 'req-1', files });
    expect(client.storage.from).toHaveBeenCalledWith(EVIDENCE_BUCKET);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({ mime: 'image/jpeg', size: 1024 });
    expect(typeof result[0].path).toBe('string');
  });

  it('RT-C10 — rolls back on upload failure by removing already-uploaded files', async () => {
    const removeMock = jest.fn().mockResolvedValue({ error: null });
    let callCount = 0;
    const uploadMock = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) return { error: { code: '500', message: 'Storage error' } };
      return { error: null };
    });
    const client = {
      rpc: jest.fn(),
      from: jest.fn(),
      storage: { from: jest.fn(() => ({ upload: uploadMock, remove: removeMock })) },
    };
    const svc = createReturnsService(client);
    const files = [
      { name: 'a.jpg', type: 'image/jpeg', size: 100, body: new ArrayBuffer(8) },
      { name: 'b.jpg', type: 'image/jpeg', size: 100, body: new ArrayBuffer(8) },
    ];
    await expect(
      svc.uploadEvidence({ uid: 'u1', requestId: 'req-1', files })
    ).rejects.toThrow();
    // Rollback: remove the first successfully uploaded file
    expect(removeMock).toHaveBeenCalled();
  });

  it('RT-C11 — throws immediately when file count exceeds maximum', async () => {
    const svc = createReturnsService({});
    const tooMany = Array.from({ length: 10 }, (_, i) => ({
      name: `f${i}.jpg`,
      type: 'image/jpeg',
      size: 100,
      body: new ArrayBuffer(8),
    }));
    await expect(
      svc.uploadEvidence({ uid: 'u1', requestId: 'req-1', files: tooMany })
    ).rejects.toThrow(/at most/i);
  });
});
