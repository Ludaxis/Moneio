/**
 * Queue Idempotency Tests
 *
 * Tests job idempotency and DLQ functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis connection
vi.mock('../redis', () => ({
  getRedisConnection: vi.fn().mockReturnValue({
    duplicate: vi.fn().mockReturnValue({}),
  }),
}));

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock BullMQ
const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockClose = vi.fn();
const registeredFailedHandlers: Array<(payload: { jobId: string; failedReason: string }) => void> =
  [];

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    getJob: mockGetJob,
    close: mockClose,
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    on: vi.fn((event, handler) => {
      if (event === 'failed') {
        registeredFailedHandlers.push(handler);
      }
    }),
    close: mockClose,
  })),
}));

import { QUEUE_NAMES, type DeadLetterJobData } from '../queues';

beforeEach(() => {
  registeredFailedHandlers.length = 0;
});

describe('Queue Configuration', () => {
  describe('QUEUE_NAMES', () => {
    it('defines all required queue names', () => {
      expect(QUEUE_NAMES.DOC_NORMALIZE).toBe('doc-normalize');
      expect(QUEUE_NAMES.DOC_OCR).toBe('doc-ocr');
      expect(QUEUE_NAMES.DOC_EXTRACT).toBe('doc-extract');
      expect(QUEUE_NAMES.DOC_POSTPROCESS).toBe('doc-postprocess');
      expect(QUEUE_NAMES.CATEGORIZATION).toBe('categorization');
      expect(QUEUE_NAMES.FX_FETCH).toBe('fx-fetch');
      expect(QUEUE_NAMES.INSIGHT_GENERATION).toBe('insight-generation');
      expect(QUEUE_NAMES.SEND_NOTIFICATION).toBe('send-notification');
      expect(QUEUE_NAMES.SEND_WEEKLY_DIGEST).toBe('send-weekly-digest');
      expect(QUEUE_NAMES.DEAD_LETTER).toBe('dead-letter-queue');
    });
  });
});

describe('Idempotent Enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new job when none exists', async () => {
    mockGetJob.mockResolvedValue(null);
    mockAdd.mockResolvedValue({ id: 'job-123', name: 'test-job' });

    // Import dynamically to get fresh mocks
    const { enqueueDocNormalize } = await import('../queues');

    const result = await enqueueDocNormalize({
      documentId: 'doc-123',
      workspaceId: 'ws-456',
    });

    expect(result.isNew).toBe(true);
    expect(mockAdd).toHaveBeenCalled();
  });

  it('returns existing job when already queued', async () => {
    const existingJob = {
      id: 'job-123',
      name: 'normalize:doc-123',
      getState: vi.fn().mockResolvedValue('waiting'),
    };
    mockGetJob.mockResolvedValue(existingJob);

    const { enqueueDocNormalize } = await import('../queues');

    const result = await enqueueDocNormalize({
      documentId: 'doc-123',
      workspaceId: 'ws-456',
    });

    expect(result.isNew).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('creates new job if existing job failed', async () => {
    const failedJob = {
      id: 'job-123',
      name: 'normalize:doc-123',
      getState: vi.fn().mockResolvedValue('failed'),
    };
    mockGetJob.mockResolvedValue(failedJob);
    mockAdd.mockResolvedValue({ id: 'job-456', name: 'normalize:doc-123' });

    const { enqueueDocNormalize } = await import('../queues');

    const result = await enqueueDocNormalize({
      documentId: 'doc-123',
      workspaceId: 'ws-456',
    });

    expect(result.isNew).toBe(true);
    expect(mockAdd).toHaveBeenCalled();
  });
});

describe('Job ID Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob.mockResolvedValue(null);
    mockAdd.mockImplementation((name, _data, opts) =>
      Promise.resolve({ id: opts?.jobId || 'auto-id', name })
    );
  });

  it('generates unique job ID for doc normalize', async () => {
    const { enqueueDocNormalize } = await import('../queues');

    await enqueueDocNormalize({ documentId: 'doc-abc', workspaceId: 'ws-1' });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.stringContaining('normalize:doc-abc'),
      expect.objectContaining({ documentId: 'doc-abc' }),
      expect.objectContaining({ jobId: 'normalize:doc-abc' })
    );
  });

  it('generates unique job ID for doc OCR with page number', async () => {
    const { enqueueDocOcr } = await import('../queues');

    await enqueueDocOcr({
      documentId: 'doc-abc',
      workspaceId: 'ws-1',
      pageNumber: 3,
      storagePath: '/path/to/file',
      mimeType: 'image/png',
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.stringContaining('ocr:doc-abc:3'),
      expect.any(Object),
      expect.objectContaining({ jobId: 'ocr:doc-abc:3' })
    );
  });

  it('generates unique job ID for categorization with transaction hash', async () => {
    const { enqueueCategorization } = await import('../queues');

    await enqueueCategorization({
      workspaceId: 'ws-1',
      transactionIds: ['tx-1', 'tx-2', 'tx-3'],
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.stringContaining('categorize:ws-1:tx-1-tx-2-tx-3'),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('generates date-based job ID for FX fetch', async () => {
    const { enqueueFxFetch } = await import('../queues');

    await enqueueFxFetch({ baseCurrency: 'EUR' });

    const today = new Date().toISOString().split('T')[0];
    expect(mockAdd).toHaveBeenCalledWith(
      expect.stringContaining(`fx:EUR:${today}`),
      expect.any(Object),
      expect.any(Object)
    );
  });
});

describe('Dead Letter Queue Data', () => {
  it('has correct structure', () => {
    const dlqData: DeadLetterJobData = {
      originalQueue: 'doc-normalize',
      originalJobId: 'job-123',
      originalJobName: 'normalize:doc-abc',
      data: { documentId: 'doc-abc', workspaceId: 'ws-1' },
      error: 'Processing failed after 3 attempts',
      failedAt: new Date().toISOString(),
      attempts: 3,
    };

    expect(dlqData.originalQueue).toBe('doc-normalize');
    expect(dlqData.originalJobId).toBe('job-123');
    expect(dlqData.attempts).toBe(3);
    expect(typeof dlqData.failedAt).toBe('string');
  });
});

describe('DLQ handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    registeredFailedHandlers.length = 0;
  });

  it('moves jobs to DLQ after final failure', async () => {
    // Idempotency check: queue is empty
    mockGetJob
      .mockResolvedValueOnce(null)
      // Failed event look-up
      .mockResolvedValueOnce({
        id: 'job-123',
        name: 'normalize:doc-123',
        data: { documentId: 'doc-123', workspaceId: 'ws-1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      });

    mockAdd.mockResolvedValue({ id: 'job-123', name: 'normalize:doc-123' });

    const { enqueueDocNormalize } = await import('../queues');

    await enqueueDocNormalize({ documentId: 'doc-123', workspaceId: 'ws-1' });

    expect(registeredFailedHandlers.length).toBeGreaterThan(0);

    mockAdd.mockClear();
    await registeredFailedHandlers[0]({ jobId: 'job-123', failedReason: 'boom' });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [jobName, payload] = mockAdd.mock.calls[0];

    expect(jobName).toBe('dlq:doc-normalize:job-123');
    expect(payload).toMatchObject({
      originalQueue: 'doc-normalize',
      originalJobId: 'job-123',
      error: 'boom',
    });
  });
});
