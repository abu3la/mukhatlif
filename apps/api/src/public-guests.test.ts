import { describe, expect, it } from 'vitest';
import type { PaginatedList, PublicGuest, PublicGuestProfile } from '@mukhtalif/types';
import type { Env } from './env';
import app from './index';

const localEnv: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
};

describe('public guest library', () => {
  it('returns a paginated anonymous directory with public fields only', async () => {
    const response = await app.request('/guests', {}, localEnv);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PaginatedList<PublicGuest>;

    expect(body.pageInfo).toMatchObject({ page: 1, perPage: 25, total: 1 });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 'gst-1001',
      slug: 'noura-al-qahtani',
      name: 'نورة القحطاني',
      episodeCount: 1,
    });
    expect(body.items[0]).not.toHaveProperty('email');
    expect(body.items[0]).not.toHaveProperty('createdAt');
  });

  it('supports paging and search without changing the envelope', async () => {
    const response = await app.request('/guests?page=1&perPage=1&search=نورة', {}, localEnv);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PaginatedList<PublicGuest>;
    expect(body.items.map((guest) => guest.id)).toEqual(['gst-1001']);
    expect(body.pageInfo).toMatchObject({ page: 1, perPage: 1, total: 1 });
  });

  it('resolves a slug to published episodes using the public episode projection', async () => {
    const response = await app.request('/guests/noura-al-qahtani', {}, localEnv);
    expect(response.status).toBe(200);
    const profile = (await response.json()) as PublicGuestProfile;

    expect(profile.guest).toMatchObject({ id: 'gst-1001', episodeCount: 1 });
    expect(profile.guest).not.toHaveProperty('email');
    expect(profile.socials).toHaveLength(1);
    expect(profile.socials[0]).toEqual({ platform: 'linkedin', handle: 'noura-alqahtani' });
    expect(profile.socials[0]).not.toHaveProperty('id');
    expect(profile.socials[0]).not.toHaveProperty('guestId');
    expect(profile.episodes.map((episode) => episode.id)).toEqual(['ep-1001']);
    expect(profile.episodes[0].status).toBe('published');
    expect(profile.episodes[0]).not.toHaveProperty('audioKey');
    expect(profile.episodes[0]).not.toHaveProperty('audioUrl');
  });

  it('does not publish a guest with no published appearance', async () => {
    expect((await app.request('/guests/faisal-al-dosari', {}, localEnv)).status).toBe(404);
  });

  it('rejects invalid paging instead of widening the query', async () => {
    expect((await app.request('/guests?page=0', {}, localEnv)).status).toBe(400);
  });
});
