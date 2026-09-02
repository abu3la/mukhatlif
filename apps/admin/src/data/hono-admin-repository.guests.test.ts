import { describe, expect, it } from 'vitest';
import { createHonoAdminRepository } from './hono-admin-repository';
import type { GuestId, GuestSocialId, EpisodeId } from '@/lib';

const API_GUEST = {
  id: 'gst-1001',
  slug: 'noura-al-qahtani',
  name: 'نورة القحطاني',
  role: 'مهندسة بترول أولى',
  city: 'الظهران',
  email: 'noura@example.com',
  bio: 'سيرة مختصرة',
  createdAt: '2026-05-04T09:00:00.000Z',
};

const API_SOCIAL = {
  id: 'gsoc-1001',
  guestId: 'gst-1001',
  platform: 'linkedin',
  handle: 'noura-alqahtani',
};

interface Call {
  url: string;
  method: string;
  body?: string;
}

function repository(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  const repo = createHonoAdminRepository({
    baseUrl: 'https://api.example.test',
    devUserId: 'usr-admin-1',
    fetch: async (input, init) => {
      const call: Call = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(call);
      return handler(call);
    },
  });
  return { repo, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('HonoAdminRepository guest directory', () => {
  it('reads the whole directory from /studio/guests without a paging parameter', async () => {
    const { repo, calls } = repository(() =>
      json({ guests: [API_GUEST], socials: [API_SOCIAL], appearances: [] }),
    );

    const directory = await repo.readGuestDirectory();

    expect(calls[0].url).toBe('https://api.example.test/studio/guests');
    expect(directory.guests[0]).toMatchObject({ slug: 'noura-al-qahtani', city: 'الظهران' });
    // Remote identifiers are namespaced before they reach the view models.
    expect(directory.guests[0].id).toBe('guest_gst-1001');
    expect(directory.guestSocials[0]).toMatchObject({
      id: 'guest_social_gsoc-1001',
      guestId: 'guest_gst-1001',
      platform: 'linkedin',
    });
  });

  it('rejects a directory payload that is not shaped as the contract requires', async () => {
    const { repo } = repository(() => json({ guests: [{ id: 'gst-1' }] }));
    await expect(repo.readGuestDirectory()).rejects.toThrow(/invalid guest directory/i);
  });

  it('reports guest management as supported', () => {
    const { repo } = repository(() => json({}));
    expect(repo.capabilities['guest-management']).toBe(true);
  });
});

describe('HonoAdminRepository guest mutations', () => {
  it('creates a blank guest without sending a slug', async () => {
    const { repo, calls } = repository(() => json(API_GUEST, 201));
    await repo.createGuest();
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/studio/guests',
      method: 'POST',
    });
    // The slug is server-owned; sending one would be rejected on update anyway.
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({});
  });

  it('sends only the supplied editorial fields on update', async () => {
    const { repo, calls } = repository(() => json(API_GUEST));
    await repo.updateGuest('guest_gst-1001' as GuestId, { city: 'جدة' });
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/studio/guests/gst-1001',
      method: 'PATCH',
    });
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ city: 'جدة' });
  });

  it('preserves an explicit empty string so a field can be cleared', async () => {
    const { repo, calls } = repository(() => json({ ...API_GUEST, city: '' }));
    await repo.updateGuest('guest_gst-1001' as GuestId, { city: '' });
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ city: '' });
  });

  it('rejects an identifier that did not come from this adapter', async () => {
    const { repo, calls } = repository(() => json(API_GUEST));
    await expect(repo.updateGuest('gst-1001' as GuestId, { city: 'جدة' })).rejects.toThrow(
      /Invalid guest identifier/,
    );
    expect(calls).toHaveLength(0);
  });

  it('creates and deletes a social link on the guest-scoped routes', async () => {
    const { repo, calls } = repository((call) =>
      call.method === 'DELETE' ? new Response(null, { status: 204 }) : json(API_SOCIAL, 201),
    );

    await repo.createGuestSocial({
      guestId: 'guest_gst-1001' as GuestId,
      platform: 'linkedin',
      handle: 'noura-alqahtani',
    });
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/studio/guests/gst-1001/socials',
      method: 'POST',
    });

    await repo.removeGuestSocial('guest_social_gsoc-1001' as GuestSocialId);
    expect(calls[1]).toMatchObject({
      url: 'https://api.example.test/studio/guests/socials/gsoc-1001',
      method: 'DELETE',
    });
  });

  it('accepts both the created and the already-linked appearance responses', async () => {
    const linked = { guestId: 'gst-1001', episodeId: 'ep-1001' };
    for (const status of [201, 200]) {
      const { repo, calls } = repository(() => json(linked, status));
      const appearance = await repo.linkGuestAppearance(
        'guest_gst-1001' as GuestId,
        'episode_ep-1001' as EpisodeId,
      );
      // Linking is idempotent, so the adapter must not assert one status.
      expect(appearance).toEqual({ guestId: 'guest_gst-1001', episodeId: 'episode_ep-1001' });
      expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ episodeId: 'ep-1001' });
    }
  });

  it('unlinks an appearance with both identifiers decoded into the path', async () => {
    const { repo, calls } = repository(() => new Response(null, { status: 204 }));
    await repo.unlinkGuestAppearance('guest_gst-1001' as GuestId, 'episode_ep-1001' as EpisodeId);
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/studio/guests/gst-1001/appearances/ep-1001',
      method: 'DELETE',
    });
  });
});
