import { describe, expect, it, vi } from 'vitest';
import { createHonoAdminRepository } from './hono-admin-repository';

const FORM_SUBMISSION = {
  id: 'frm-1001',
  type: 'sponsorship',
  status: 'new',
  assigneeId: 'member-7',
  internalNotes: '',
  attachmentRefs: [],
  sourceMetadata: {
    requestId: '2e81d9f9-b8b6-44b0-b31a-7dc02e54f937',
    formVersion: 1,
    privacyAcceptedAt: '2026-09-02T09:00:00.000Z',
    clientSurface: 'web',
    referrerPath: '/sponsor',
  },
  notificationStatus: 'failed',
  notificationAttemptCount: 1,
  notificationAttemptedAt: '2026-09-02T09:00:02.000Z',
  notificationError: 'DELIVERY_REJECTED',
  statusUpdatedAt: '2026-09-02T09:00:00.000Z',
  createdAt: '2026-09-02T09:00:00.000Z',
  updatedAt: '2026-09-02T09:00:02.000Z',
  payload: {
    organizationName: 'شركة مثال',
    contactName: 'نورة السالم',
    email: 'noura@example.com',
    phone: '+966501234567',
  },
} as const;

describe('HonoAdminRepository form submissions', () => {
  it('requests a filtered page and namespaces the assignee identifier', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [FORM_SUBMISSION],
        pageInfo: {
          page: 2,
          perPage: 20,
          total: 25,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'admin-subject',
      fetch: fetcher,
    });

    await expect(
      repository.listFormSubmissions({
        page: 2,
        perPage: 20,
        type: 'sponsorship',
        status: 'new',
        assigneeId: 'studio_member_member-7',
      }),
    ).resolves.toMatchObject({
      items: [{ id: 'frm-1001', assigneeId: 'studio_member_member-7' }],
      pageInfo: { page: 2, total: 25 },
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/studio/form-submissions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      perPage: '20',
      type: 'sponsorship',
      status: 'new',
      assigneeId: 'member-7',
    });
  });

  it('sends only editable fields and decodes the Studio assignee', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ...FORM_SUBMISSION, status: 'in_review', internalNotes: 'تواصل غدًا.' }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await repository.updateFormSubmission('frm-1001', {
      status: 'in_review',
      assigneeId: 'studio_member_member-7',
      internalNotes: 'تواصل غدًا.',
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/studio/form-submissions/frm-1001',
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      status: 'in_review',
      assigneeId: 'member-7',
      internalNotes: 'تواصل غدًا.',
    });
  });

  it('uses the protected retry endpoint and parses the updated result', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...FORM_SUBMISSION,
        notificationStatus: 'sent',
        notificationAttemptCount: 2,
        notificationError: undefined,
      }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(repository.retryFormSubmissionNotification('frm-1001')).resolves.toMatchObject({
      notificationStatus: 'sent',
      notificationAttemptCount: 2,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/studio/form-submissions/frm-1001/notification/retry',
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('rejects malformed payloads before they reach the interface', async () => {
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          ...FORM_SUBMISSION,
          payload: { organizationName: 'شركة بلا بيانات تواصل' },
        }),
      ),
    });

    await expect(repository.getFormSubmission('frm-1001')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      operation: 'getFormSubmission',
    });
  });
});
