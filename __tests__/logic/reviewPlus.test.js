/**
 * Service layer for review photos / votes / Q&A. supabase is mocked, so what is
 * pinned here is the contract with the SQL migration: argument names, how rows
 * are mapped, and - most importantly - that a backend which doesn't have the
 * feature yet degrades to "unavailable" (once-only warning) instead of
 * throwing, while real failures keep the server's own message.
 */
const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn(() => ({ select: mockSelect }));
const mockDelete = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ delete: mockDelete }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
    storage: {
      from: () => ({
        upload: (...args) => mockUpload(...args),
        remove: (...args) => mockRemove(...args),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/review-photos/${path}` } }),
      }),
    },
  },
}));

const svc = require('@/services/reviewsPlus');

const MISSING = { code: 'PGRST202', message: 'Could not find the function public.x(...) in the schema cache' };

beforeEach(() => {
  mockRpc.mockReset();
  mockUpload.mockReset();
  mockRemove.mockReset();
  mockSelect.mockReset();
  global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1024) }));
});

describe('isMissingBackend', () => {
  it('recognises PostgREST "not there yet" signals and nothing else', () => {
    expect(svc.isMissingBackend({ code: 'PGRST202' })).toBe(true);
    expect(svc.isMissingBackend({ code: 'PGRST205' })).toBe(true);
    expect(svc.isMissingBackend({ code: '42883' })).toBe(true);
    expect(svc.isMissingBackend({ code: '42P01' })).toBe(true);
    expect(svc.isMissingBackend({ message: 'Could not find the function public.f' })).toBe(true);
    expect(svc.isMissingBackend({ message: 'relation not in the schema cache' })).toBe(true);
    expect(svc.isMissingBackend({ code: '42501', message: 'You cannot vote on your own review' })).toBe(false);
    expect(svc.isMissingBackend(null)).toBe(false);
  });
});

describe('reviewPhotoUrl', () => {
  it('builds the public URL from a stored path, and is empty for no path', () => {
    expect(svc.reviewPhotoUrl('u1/o_p/1_0.jpg')).toBe('https://cdn.test/review-photos/u1/o_p/1_0.jpg');
    expect(svc.reviewPhotoUrl('')).toBe('');
  });
});

describe('fetchReviewVotes', () => {
  it('maps rows to camelCase keyed by review id', async () => {
    mockRpc.mockResolvedValue({
      data: [{ review_id: 'r1', helpful_count: 3, unhelpful_count: 1, my_vote: -1 }],
      error: null,
    });
    await expect(svc.fetchReviewVotes('p1')).resolves.toEqual({
      r1: { helpfulCount: 3, unhelpfulCount: 1, myVote: -1 },
    });
    expect(mockRpc).toHaveBeenCalledWith('review_vote_summary', { p_product_id: 'p1' });
  });

  it('returns null (feature missing) and warns only once per session', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: MISSING });
    await expect(svc.fetchReviewVotes('p1')).resolves.toBeNull();
    await expect(svc.fetchReviewVotes('p2')).resolves.toBeNull();
    await expect(svc.fetchProductQA('p1')).resolves.toMatchObject({ available: false });
    expect(warn.mock.calls.filter(([m]) => String(m).includes('[reviewsPlus]'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('throws on a real error instead of hiding it', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection lost' } });
    await expect(svc.fetchReviewVotes('p1')).rejects.toThrow('connection lost');
  });
});

describe('voteOnReview', () => {
  it('sends the vote and returns the authoritative tallies from the single row', async () => {
    mockRpc.mockResolvedValue({
      data: [{ helpful_count: 5, unhelpful_count: 0, my_vote: 1 }],
      error: null,
    });
    await expect(svc.voteOnReview('r1', 1)).resolves.toEqual({ helpfulCount: 5, unhelpfulCount: 0, myVote: 1 });
    expect(mockRpc).toHaveBeenCalledWith('vote_on_review', { p_review_id: 'r1', p_vote: 1 });
  });

  it("rejects with the server's readable message when refused", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'You cannot vote on your own review' } });
    await expect(svc.voteOnReview('r1', 1)).rejects.toThrow('You cannot vote on your own review');
  });
});

describe('fetchProductQA', () => {
  it('maps permissions, questions and nested answers', async () => {
    mockRpc.mockImplementation(async (fn) =>
      fn === 'product_qa_permissions'
        ? { data: { can_ask: true, can_answer: false, is_staff: false }, error: null }
        : {
            data: [
              {
                id: 'q1',
                question: 'Does it fit a 5kg bag?',
                created_at: '2026-10-01T00:00:00Z',
                asker: 'Asha K.',
                is_mine: true,
                answers: [
                  {
                    id: 'a1',
                    answer: 'Yes',
                    created_at: '2026-10-02T00:00:00Z',
                    answerer: 'Store',
                    is_staff: true,
                    is_mine: false,
                  },
                ],
              },
            ],
            error: null,
          }
    );
    const result = await svc.fetchProductQA('p1');
    expect(result.available).toBe(true);
    expect(result.permissions).toEqual({ canAsk: true, canAnswer: false, isStaff: false });
    expect(result.questions).toEqual([
      {
        id: 'q1',
        question: 'Does it fit a 5kg bag?',
        createdAt: '2026-10-01T00:00:00Z',
        asker: 'Asha K.',
        isMine: true,
        answers: [
          {
            id: 'a1',
            answer: 'Yes',
            createdAt: '2026-10-02T00:00:00Z',
            answerer: 'Store',
            isStaff: true,
            isMine: false,
          },
        ],
      },
    ]);
  });
});

describe('asking, answering and deleting', () => {
  it('ask/answer call the RPCs with the migration argument names', async () => {
    mockRpc.mockResolvedValue({ data: 'new-id', error: null });
    await expect(svc.askQuestion('p1', 'Is it vegan?')).resolves.toBe('new-id');
    expect(mockRpc).toHaveBeenCalledWith('ask_product_question', { p_product_id: 'p1', p_question: 'Is it vegan?' });
    await svc.answerQuestion('q1', 'Yes it is');
    expect(mockRpc).toHaveBeenCalledWith('answer_product_question', { p_question_id: 'q1', p_answer: 'Yes it is' });
  });

  it('surfaces the server message, e.g. the flood guard', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '54000', message: 'You are asking too fast. Please try again later.' },
    });
    await expect(svc.askQuestion('p1', 'Anything here?')).rejects.toThrow('You are asking too fast');
  });

  it('delete targets the right table and treats zero rows (an RLS refusal) as a failure', async () => {
    mockSelect.mockResolvedValueOnce({ data: [{ id: 'q1' }], error: null });
    await expect(svc.deleteQuestion('q1')).resolves.toBeUndefined();
    expect(mockFrom).toHaveBeenCalledWith('product_questions');
    expect(mockEq).toHaveBeenCalledWith('id', 'q1');

    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    await expect(svc.deleteAnswer('a1')).rejects.toThrow(/Could not delete the answer/);
    expect(mockFrom).toHaveBeenCalledWith('product_answers');
  });
});

describe('setReviewPhotos', () => {
  it('passes the paths through, and an empty array clears', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await svc.setReviewPhotos('rev1', ['u/a.jpg']);
    expect(mockRpc).toHaveBeenCalledWith('set_review_photos', { p_review_id: 'rev1', p_photos: ['u/a.jpg'] });
    await svc.setReviewPhotos('rev1', []);
    expect(mockRpc).toHaveBeenLastCalledWith('set_review_photos', { p_review_id: 'rev1', p_photos: [] });
  });
});

describe('uploadReviewPhotos', () => {
  const asset = (name, extra = {}) => ({
    uri: `file:///tmp/${name}`,
    fileName: name,
    mimeType: 'image/jpeg',
    ...extra,
  });
  const base = { userId: 'u1', orderId: 'o1', productId: 'p1' };

  it('uploads each file under <userId>/<orderId>_<productId>/ with its content type', async () => {
    mockUpload.mockResolvedValue({ error: null });
    const paths = await svc.uploadReviewPhotos({
      ...base,
      orderId: 'o 1',
      files: [asset('a.jpg'), asset('b.png', { mimeType: 'image/png' })],
    });
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/^u1\/o_1_p1\/\d+_0\.jpg$/);
    expect(paths[1]).toMatch(/^u1\/o_1_p1\/\d+_1\.png$/);
    expect(mockUpload).toHaveBeenCalledWith(paths[0], expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(mockUpload).toHaveBeenCalledWith(paths[1], expect.any(ArrayBuffer), {
      contentType: 'image/png',
      upsert: false,
    });
  });

  it('rejects invalid files before uploading anything (gif, svg, too big)', async () => {
    await expect(
      svc.uploadReviewPhotos({ ...base, files: [asset('a.jpg'), asset('x.gif', { mimeType: 'image/gif' })] })
    ).rejects.toThrow(/Only PNG, JPG, WEBP/);
    await expect(
      svc.uploadReviewPhotos({ ...base, files: [asset('x.svg', { mimeType: 'image/svg+xml' })] })
    ).rejects.toThrow(/SVG/);
    await expect(
      svc.uploadReviewPhotos({ ...base, files: [asset('big.jpg', { fileSize: 4 * 1024 * 1024 })] })
    ).rejects.toThrow(/too large/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('measures the real bytes when the picker reports no size', async () => {
    global.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(3 * 1024 * 1024 + 1) }));
    await expect(svc.uploadReviewPhotos({ ...base, files: [asset('a.jpg')] })).rejects.toThrow(/too large/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('removes already-stored files if a later upload fails (all-or-nothing)', async () => {
    mockUpload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'Bucket not found' } });
    mockRemove.mockResolvedValue({ error: null });
    await expect(svc.uploadReviewPhotos({ ...base, files: [asset('a.jpg'), asset('b.jpg')] })).rejects.toThrow(
      'Bucket not found'
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove.mock.calls[0][0]).toHaveLength(1);
  });

  it('caps at 4 files and requires a user id', async () => {
    mockUpload.mockResolvedValue({ error: null });
    const files = Array.from({ length: 6 }, (_, i) => asset(`f${i}.jpg`));
    const paths = await svc.uploadReviewPhotos({ ...base, files });
    expect(paths).toHaveLength(4);
    await expect(svc.uploadReviewPhotos({ orderId: 'o1', productId: 'p1', files })).rejects.toThrow(/sign in/i);
  });
});