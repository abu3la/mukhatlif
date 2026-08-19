import { describe, expect, it } from 'vitest';
import { createFixtureAdminRepository } from '@/data';
import type { EpisodeId, ShowId } from '@/lib';
import { saveEpisodeDraft } from './save-episode';

function fixedClock() {
  return new Date('2026-08-16T10:00:00.000Z');
}

describe('saveEpisodeDraft', () => {
  it('creates a complete draft through the repository boundary', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const core = await repository.readContentWorkspace();
    const id = await saveEpisodeDraft(
      repository,
      {
        title: 'حلقة اختبارية',
        showId: core.shows[0].id,
        episodeNumber: 23,
        durationMinutes: 41,
        notes: 'ملاحظات واضحة',
        premium: false,
      },
      'draft',
    );
    const after = await repository.readContentWorkspace();
    const created = after.episodes.find((episode) => episode.id === id);

    expect(created).toMatchObject({
      title: 'حلقة اختبارية',
      episodeNumber: 23,
      durationMinutes: 41,
      status: 'draft',
    });
  });

  it('uploads the selected file before scheduling the new episode', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const core = await repository.readContentWorkspace();
    const audio = new File(['audio'], 'episode-24.mp3', { type: 'audio/mpeg' });
    const id = await saveEpisodeDraft(
      repository,
      {
        title: 'حلقة مجدولة',
        showId: core.shows[0].id,
        episodeNumber: 24,
        durationMinutes: 35,
        notes: '',
        premium: true,
        scheduledAt: '2026-08-18T14:30',
        audioFile: audio,
      },
      'scheduled',
    );
    const after = await repository.readContentWorkspace();
    const created = after.episodes.find((episode) => episode.id === id);

    expect(created?.status).toBe('scheduled');
    expect(created?.audioFileName).toBe('episode-24.mp3');
    expect(created?.scheduledAt).toBe('2026-08-18T11:30:00.000Z');
  });

  it('rejects incomplete numeric fields before creating a record', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const core = await repository.readContentWorkspace();

    await expect(
      saveEpisodeDraft(
        repository,
        {
          title: 'حلقة ناقصة',
          showId: core.shows[0].id,
          episodeNumber: null,
          durationMinutes: 12,
          notes: '',
          premium: false,
        },
        'draft',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', operation: 'saveEpisode' });
  });

  it('rejects moving an existing episode to another show', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const core = await repository.readContentWorkspace();
    const current = core.episodes[0];
    const otherShow = core.shows.find((show) => show.id !== current.showId);
    expect(otherShow).toBeDefined();

    await expect(
      saveEpisodeDraft(
        repository,
        {
          id: current.id as EpisodeId,
          title: current.title,
          showId: otherShow?.id as ShowId,
          episodeNumber: current.episodeNumber,
          durationMinutes: current.durationMinutes,
          notes: current.notes,
          premium: current.premium,
        },
        current.status,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION', operation: 'saveEpisode' });
  });
});
