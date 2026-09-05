import { describe, expect, it, vi } from 'vitest';
import { createFixtureAdminRepository } from '@/data';
import type { EpisodeId, ShowId } from '@/lib';
import { saveEpisodeDraft, uploadEpisodeAudioDraft } from './save-episode';

function fixedClock() {
  return new Date('2026-08-16T10:00:00.000Z');
}

describe('saveEpisodeDraft', () => {
  it('retains the created draft id when audio fails, so retry does not duplicate the episode', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const before = await repository.readContentWorkspace();
    const upload = vi
      .spyOn(repository, 'uploadEpisodeAudio')
      .mockRejectedValueOnce(new Error('offline'));
    const onDraftSaved = vi.fn();
    const draft = {
      title: 'اختبار استئناف المسودة',
      showId: before.shows[0].id,
      episodeNumber: 88,
      durationMinutes: 1,
      notes: '',
      premium: false,
      audioFile: new File(['audio'], 'test.wav'),
      onDraftSaved,
    };
    await expect(uploadEpisodeAudioDraft(repository, draft)).rejects.toThrow('offline');
    const id = onDraftSaved.mock.calls[0]?.[0] as EpisodeId;
    expect(id).toBeDefined();
    upload.mockRestore();
    const onAudioUploaded = vi.fn();
    await uploadEpisodeAudioDraft(repository, { ...draft, id, onAudioUploaded });
    expect((await repository.readContentWorkspace()).episodes).toHaveLength(
      before.episodes.length + 1,
    );
    expect(onAudioUploaded).toHaveBeenCalledOnce();
  });
  it('persists a YouTube choice and explicitly clears it without changing the audio', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const core = await repository.readContentWorkspace();
    const draft = {
      title: 'حلقة فيديو اختبارية',
      showId: core.shows[0].id,
      episodeNumber: 55,
      durationMinutes: 40,
      notes: '',
      premium: false,
      youtubeVideoId: 'Ioch353mcfc',
    };
    const id = await saveEpisodeDraft(repository, draft, 'draft');
    expect(
      (await repository.readContentWorkspace()).episodes.find((e) => e.id === id)?.youtubeVideoId,
    ).toBe('Ioch353mcfc');
    await saveEpisodeDraft(repository, { ...draft, id, youtubeVideoId: null }, 'draft');
    expect(
      (await repository.readContentWorkspace()).episodes.find((e) => e.id === id)?.youtubeVideoId,
    ).toBeNull();
  });
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

  it('only uploads on the explicit action, then schedules separately without uploading again', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const core = await repository.readContentWorkspace();
    const audio = new File(['audio'], 'episode-24.mp3', { type: 'audio/mpeg' });
    const draft = {
      title: 'حلقة مجدولة',
      showId: core.shows[0].id,
      episodeNumber: 24,
      durationMinutes: 35,
      notes: '',
      premium: true,
      scheduledAt: '2026-08-18T14:30',
      audioFile: audio,
    };
    const upload = vi.spyOn(repository, 'uploadEpisodeAudio');
    const id = await saveEpisodeDraft(repository, draft, 'draft');
    expect(upload).not.toHaveBeenCalled();
    await uploadEpisodeAudioDraft(repository, { ...draft, id });
    expect(
      (await repository.readContentWorkspace()).episodes.find((e) => e.id === id)?.status,
    ).toBe('draft');
    await saveEpisodeDraft(repository, { ...draft, id }, 'scheduled');
    expect(upload).toHaveBeenCalledOnce();
    const after = await repository.readContentWorkspace();
    const created = after.episodes.find((episode) => episode.id === id);

    expect(created?.status).toBe('scheduled');
    expect(created?.audioFileName).toBe('episode-24.mp3');
    expect(created?.scheduledAt).toBe('2026-08-18T11:30:00.000Z');
  });

  it('uploads to an existing episode without saving unsaved metadata or changing its status', async () => {
    const repository = createFixtureAdminRepository({ now: fixedClock });
    const current = (await repository.readContentWorkspace()).episodes[0];
    const update = vi.spyOn(repository, 'updateEpisode');
    const transition = vi.spyOn(repository, 'transitionEpisode');
    await uploadEpisodeAudioDraft(repository, {
      ...current,
      title: 'تعديل غير محفوظ',
      audioFile: new File(['audio'], 'new.mp3'),
    });
    const after = (await repository.readContentWorkspace()).episodes.find(
      (e) => e.id === current.id,
    );
    expect(update).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
    expect(after).toMatchObject({
      title: current.title,
      status: current.status,
      audioFileName: 'new.mp3',
    });
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
