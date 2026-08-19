import { describe, expect, it, vi } from 'vitest';
import { createHonoAdminRepository } from './hono-admin-repository';

const STUDIO_MEMBER_RESPONSE = {
  id: 'target',
  email: 'target@example.com',
  displayName: 'نورة الشمري',
  role: 'editor',
  roleName: 'مدير المحتوى',
  locale: 'ar',
  createdAt: '2026-01-01T00:00:00.000Z',
  authLinked: true,
};

const ARTICLE_RESPONSE = {
  id: 'weekly-1',
  slug: 'weekly-1',
  titleAr: 'رسالة الأسبوع',
  author: { type: 'custom', displayName: 'فريق مختلف' },
  authorPlacement: 'after_title',
  excerptAr: 'ملخص الرسالة',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'المحتوى' }] }],
  },
  contentHtml: '<p>المحتوى</p>',
  bodyAr: 'المحتوى',
  seo: { noIndex: false },
  status: 'draft',
  newsletter: {
    enabled: true,
    subject: 'رسالة الأسبوع',
    status: 'draft',
    needsSync: false,
  },
  version: 2,
  createdAt: '2026-08-16T09:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
};

const READY_MEDIA_RESPONSE = {
  id: 'med-00000000000000000000000000000001',
  kind: 'image',
  mimeType: 'image/png',
  fileName: 'weekly.png',
  byteSize: 8,
  width: 1200,
  height: 800,
  defaultAlt: 'صورة العدد الأسبوعي',
  defaultCaption: 'من استوديو مختلف',
  status: 'ready',
  publicUrl: 'https://media.example.test/med-00000000000000000000000000000001',
  createdAt: '2026-08-17T12:00:00.000Z',
} as const;

describe('HonoAdminRepository Studio access management', () => {
  it('loads the authenticated administration identity from /studio/me', async () => {
    const requestedUrls: string[] = [];
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: (async (input: RequestInfo | URL) => {
        requestedUrls.push(String(input));
        return Response.json({
          id: 'viewer',
          email: 'viewer@example.com',
          displayName: 'محرر',
          role: 'editor',
          roleName: 'مدير المحتوى',
          locale: 'ar',
          createdAt: '2026-01-01T00:00:00.000Z',
          permissions: ['articles.view'],
        });
      }) as typeof fetch,
    });

    await expect(repository.readViewer()).resolves.toMatchObject({
      id: 'studio_member_viewer',
      permissions: ['articles.view'],
    });
    expect(requestedUrls).toEqual(['https://api.example.test/studio/me']);
    expect(requestedUrls).not.toContain('https://api.example.test/me');
  });

  it('reads only Studio members from /studio-members', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json([STUDIO_MEMBER_RESPONSE]));
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(repository.readStudioMemberDirectory()).resolves.toEqual({
      studioMembers: [
        {
          id: 'studio_member_target',
          name: 'نورة الشمري',
          email: 'target@example.com',
          role: 'editor',
          roleName: 'مدير المحتوى',
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/studio-members',
    );
  });

  it('updates a Studio role through the Studio-member route', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(STUDIO_MEMBER_RESPONSE));
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'admin-subject',
      fetch: fetcher,
    });

    await expect(
      repository.updateStudioMemberRole('studio_member_target', 'editor'),
    ).resolves.toMatchObject({
      id: 'studio_member_target',
      role: 'editor',
    });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.test/studio-members/target/role');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ role: 'editor' }));
    expect(new Headers(init?.headers).get('x-dev-user')).toBe('admin-subject');
  });

  it('creates a Studio account with the strict invitation command', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json(
        {
          ...STUDIO_MEMBER_RESPONSE,
          id: 'created-member',
          email: 'new.member@example.com',
          displayName: 'عضو جديد',
          createdAt: '2026-08-16T10:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'admin-subject',
      fetch: fetcher,
    });

    await expect(
      repository.createStudioMember({
        name: '  عضو جديد ',
        email: ' NEW.MEMBER@EXAMPLE.COM ',
        role: 'editor',
        locale: 'ar',
      }),
    ).resolves.toEqual({
      id: 'studio_member_created-member',
      name: 'عضو جديد',
      email: 'new.member@example.com',
      role: 'editor',
      roleName: 'مدير المحتوى',
      joinedAt: '2026-08-16T10:00:00.000Z',
    });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.test/studio-members');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      JSON.stringify({
        displayName: 'عضو جديد',
        email: 'new.member@example.com',
        role: 'editor',
        locale: 'ar',
      }),
    );
  });

  it.each([
    [409, 'EMAIL_ALREADY_EXISTS', 'CONFLICT', false],
    [409, 'AUTH_IDENTITY_ALREADY_EXISTS', 'CONFLICT', false],
    [422, 'INVITE_DELIVERY_FAILED', 'REMOTE_UNAVAILABLE', true],
    [422, 'STUDIO_MEMBER_PROVISIONING_FAILED', 'REMOTE_UNAVAILABLE', true],
    [503, 'AUTH_PROVISIONING_UNAVAILABLE', 'REMOTE_UNAVAILABLE', true],
    [500, 'STUDIO_MEMBER_PROVISIONING_PARTIAL_FAILURE', 'REMOTE_ERROR', false],
  ] as const)(
    'maps Studio invitation error %s/%s without parsing display text',
    async (status, remoteCode, expectedCode, retryable) => {
      const repository = createHonoAdminRepository({
        baseUrl: 'https://api.example.test',
        fetch: (async () =>
          Response.json(
            { error: 'opaque_remote_message', code: remoteCode },
            { status },
          )) as typeof fetch,
      });

      await expect(
        repository.createStudioMember({
          name: 'عضو جديد',
          email: 'new.member@example.com',
          role: 'editor',
          locale: 'ar',
        }),
      ).rejects.toMatchObject({
        code: expectedCode,
        operation: 'createStudioMember',
        status,
        retryable,
        context: { remoteCode },
      });
    },
  );

  it('fails closed on unlinked, mismatched, or wrong-status create responses', async () => {
    const validResponse = {
      ...STUDIO_MEMBER_RESPONSE,
      id: 'created-member',
      email: 'new.member@example.com',
      displayName: 'عضو جديد',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ ...validResponse, authLinked: false }, { status: 201 }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...validResponse, role: 'admin' }, { status: 201 }),
      )
      .mockResolvedValueOnce(Response.json(validResponse, { status: 200 }));
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });
    const command = {
      name: 'عضو جديد',
      email: 'new.member@example.com',
      role: 'editor',
      locale: 'ar' as const,
    };

    await expect(repository.createStudioMember(command)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      operation: 'createStudioMember',
    });
    await expect(repository.createStudioMember(command)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      operation: 'createStudioMember',
    });
    await expect(repository.createStudioMember(command)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      operation: 'createStudioMember',
      status: 200,
    });
  });

  it('rejects app-listener roles before issuing a Studio request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.createStudioMember({
        name: 'مستمع',
        email: 'listener@example.com',
        role: 'listener',
        locale: 'ar',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', operation: 'createStudioMember' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the subscriber directory on the app-user endpoint', async () => {
    const requestedUrls: string[] = [];
    const appUser = {
      id: 'listener',
      email: 'listener@example.com',
      displayName: 'مستمع',
      locale: 'ar',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith('/plans')) {
          return Response.json([
            {
              id: 'plus',
              nameAr: 'مختلف بلس',
              priceMinor: 2900,
              currency: 'SAR',
              interval: 'month',
            },
          ]);
        }
        if (url.endsWith('/subscriber-users')) return Response.json([appUser]);
        if (url.endsWith('/subscriptions')) return Response.json([]);
        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch,
    });

    await expect(repository.readSubscriberDirectory()).resolves.toMatchObject({
      users: [
        {
          id: 'user_listener',
          name: 'مستمع',
          email: 'listener@example.com',
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(requestedUrls).toContain('https://api.example.test/subscriber-users');
    expect(requestedUrls).not.toContain('https://api.example.test/studio-members');
  });

  it('sends strict role-permission updates with member counts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        id: 'editor',
        name: 'مدير المحتوى',
        description: 'إدارة المحتوى.',
        isSystem: true,
        isProtected: false,
        permissions: ['articles.view', 'articles.manage'],
        memberCount: 2,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-17T00:00:00.000Z',
      }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.updateRolePermissions('editor', [
        'articles.view',
        'articles.manage',
      ]),
    ).resolves.toMatchObject({ memberCount: 2 });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ permissions: ['articles.view', 'articles.manage'] }),
    );
  });

  it('reads and creates dynamic Studio roles', async () => {
    const role = {
      id: 'article-reviewer',
      name: 'مراجع المقالات',
      description: 'يراجع المقالات.',
      isSystem: false,
      isProtected: false,
      permissions: ['articles.view'],
      memberCount: 0,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([role]))
      .mockResolvedValueOnce(Response.json(role, { status: 201 }));
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(repository.readRoles()).resolves.toEqual([role]);
    await expect(
      repository.createRole({
        name: '  مراجع المقالات  ',
        description: '  يراجع المقالات.  ',
        permissions: ['articles.view'],
      }),
    ).resolves.toEqual(role);
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.example.test/roles');
  });
});

describe('HonoAdminRepository article publishing boundary', () => {
  it('returns only the safe article-author candidate projection', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          studioMemberId: 'member-1',
          displayName: 'نورة الشمري',
          email: 'private@example.test',
          role: 'admin',
        },
      ]),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(repository.listArticleAuthors()).resolves.toEqual([
      { studioMemberId: 'studio_member_member-1', displayName: 'نورة الشمري' },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/studio/articles/authors',
      expect.any(Object),
    );
  });

  it('keeps Studio member ids namespaced in admin state and raw on the API wire', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...ARTICLE_RESPONSE,
        author: {
          type: 'studio_member',
          studioMemberId: 'member-1',
          displayName: 'نورة الشمري',
        },
      }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.createArticle({
        slug: 'weekly-1',
        title: 'رسالة الأسبوع',
        author: { type: 'studio_member', studioMemberId: 'studio_member_member-1' },
        authorPlacement: 'after_title',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'المحتوى' }],
            },
          ],
        },
        seo: { noIndex: false },
        newsletter: { enabled: false },
      }),
    ).resolves.toMatchObject({
      authorPlacement: 'after_title',
      author: {
        type: 'studio_member',
        studioMemberId: 'studio_member_member-1',
        displayName: 'نورة الشمري',
      },
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      author: { type: 'studio_member', studioMemberId: 'member-1' },
      authorPlacement: 'after_title',
    });
  });

  it('maps cleared optional fields to null and includes the expected article version', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(ARTICLE_RESPONSE));
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await repository.updateArticle('article_weekly-1', {
      expectedVersion: 1,
      authorPlacement: 'end',
      excerpt: '',
      coverUrl: '',
      coverAlt: '',
      seo: {
        title: '',
        description: '',
        canonicalUrl: '',
        socialTitle: '',
        socialDescription: '',
        socialImageUrl: '',
        noIndex: false,
      },
      newsletter: { enabled: true, subject: '', preheader: '' },
    });

    const payload = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      expectedVersion: 1,
      authorPlacement: 'end',
      excerptAr: null,
      coverUrl: null,
      coverAlt: null,
      seo: {
        title: null,
        description: null,
        canonicalUrl: null,
        socialTitle: null,
        socialDescription: null,
        socialImageUrl: null,
        noIndex: false,
      },
      newsletter: { enabled: true, subject: null, preheader: null },
    });
  });

  it('rejects malformed nested newsletter data from the remote API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...ARTICLE_RESPONSE,
        newsletter: { ...ARTICLE_RESPONSE.newsletter, campaignId: 42 },
      }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.updateArticle('article_weekly-1', { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects an unsupported author placement from the remote API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ...ARTICLE_RESPONSE, authorPlacement: 'sidebar' }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.updateArticle('article_weekly-1', { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fences Mailchimp campaign synchronization to the saved article version', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ article: ARTICLE_RESPONSE, operation: 'created' }),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.syncArticleNewsletterCampaign('article_weekly-1', 2),
    ).resolves.toMatchObject({ operation: 'created' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ expectedVersion: 2 }));
  });

  it('binds newsletter delivery to the opaque audience confirmation token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { article: ARTICLE_RESPONSE, operation: 'accepted' },
        { status: 202 },
      ),
    );
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
    });

    await expect(
      repository.sendArticleNewsletter(
        'article_weekly-1',
        'opaque-audience-confirmation-token-v1',
        2,
        'campaign-weekly-1',
      ),
    ).resolves.toMatchObject({ operation: 'accepted' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        confirmation: 'SEND_NEWSLETTER',
        audienceConfirmationToken: 'opaque-audience-confirmation-token-v1',
        expectedVersion: 2,
        expectedCampaignId: 'campaign-weekly-1',
      }),
    );
  });

  it('reserves an image then uploads its raw bytes with authenticated XHR progress', async () => {
    const pending = { ...READY_MEDIA_RESPONSE, status: 'pending' as const, publicUrl: undefined };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          asset: pending,
          uploadUrl: `/studio/media/uploads/${pending.id}/content`,
        },
        { status: 201 },
      ),
    );
    const headers = new Map<string, string>();
    const sentBodies: XMLHttpRequestBodyInit[] = [];
    const requestListeners = new Map<string, Array<EventListenerOrEventListenerObject>>();
    const uploadListeners = new Map<string, Array<EventListenerOrEventListenerObject>>();
    const addListener = (
      target: Map<string, Array<EventListenerOrEventListenerObject>>,
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => target.set(type, [...(target.get(type) ?? []), listener]);
    const dispatch = (
      target: Map<string, Array<EventListenerOrEventListenerObject>>,
      type: string,
      event: Event,
    ) => {
      for (const listener of target.get(type) ?? []) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    };
    const request = {
      status: 200,
      statusText: 'OK',
      responseText: JSON.stringify(READY_MEDIA_RESPONSE),
      upload: {
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
          addListener(uploadListeners, type, listener),
      },
      open: vi.fn(),
      setRequestHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      getResponseHeader: () => 'application/json',
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        addListener(requestListeners, type, listener),
      send: (body: XMLHttpRequestBodyInit) => {
        sentBodies.push(body);
        dispatch(
          uploadListeners,
          'progress',
          { lengthComputable: true, loaded: 4, total: 8 } as ProgressEvent,
        );
        dispatch(requestListeners, 'load', new Event('load'));
      },
    } as unknown as XMLHttpRequest;
    const repository = createHonoAdminRepository({
      baseUrl: 'https://api.example.test',
      devUserId: 'editor-subject',
      fetch: fetcher,
      createUploadRequest: () => request,
    });
    const progress: number[] = [];
    const body = new Blob(['12345678'], { type: 'image/png' });

    await expect(
      repository.uploadArticleImage({
        body,
        fileName: 'weekly.png',
        mimeType: 'image/png',
        byteSize: 8,
        width: 1200,
        height: 800,
        alt: 'صورة العدد الأسبوعي',
        caption: 'من استوديو مختلف',
        onProgress: (value) => progress.push(value),
      }),
    ).resolves.toEqual(READY_MEDIA_RESPONSE);

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example.test/studio/media/uploads');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      fileName: 'weekly.png',
      mimeType: 'image/png',
      byteSize: 8,
      width: 1200,
      height: 800,
      defaultAlt: 'صورة العدد الأسبوعي',
      defaultCaption: 'من استوديو مختلف',
    });
    expect(request.open).toHaveBeenCalledWith(
      'PUT',
      `https://api.example.test/studio/media/uploads/${pending.id}/content`,
      true,
    );
    expect(headers.get('x-dev-user')).toBe('editor-subject');
    expect(headers.get('content-type')).toBe('image/png');
    expect(sentBodies).toEqual([body]);
    expect(progress).toEqual([0, 50, 100]);
  });
});
