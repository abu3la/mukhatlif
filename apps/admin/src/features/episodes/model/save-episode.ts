import type { EpisodeDraft } from '@/application';
import type { AdminRepository } from '@/data';
import { AdminRepositoryError } from '@/data';
import { riyadhLocalInputToIso, type EpisodeId, type EpisodeStatus } from '@/lib';

function validationError(message: string, context?: Readonly<Record<string, unknown>>) {
  return new AdminRepositoryError({
    code: 'VALIDATION',
    operation: 'saveEpisode',
    message,
    retryable: false,
    context,
  });
}

/**
 * Coordinates the episode form with the repository state machine. Creation,
 * metadata updates, binary upload, and publication happen in that order.
 */
export async function saveEpisodeDraft(
  repository: AdminRepository,
  draft: EpisodeDraft,
  targetStatus: EpisodeStatus,
): Promise<EpisodeId> {
  if (draft.episodeNumber == null || !Number.isInteger(draft.episodeNumber) || draft.episodeNumber <= 0) {
    throw validationError('Episode number must be a positive integer.', {
      episodeNumber: draft.episodeNumber,
    });
  }
  if (draft.durationMinutes == null || !Number.isFinite(draft.durationMinutes) || draft.durationMinutes < 0) {
    throw validationError('Episode duration must be a non-negative number.', {
      durationMinutes: draft.durationMinutes,
    });
  }

  const core = await repository.readContentWorkspace();
  const current = draft.id
    ? core.episodes.find((episode) => episode.id === draft.id)
    : undefined;
  if (draft.id && !current) {
    throw new AdminRepositoryError({
      code: 'NOT_FOUND',
      operation: 'saveEpisode',
      message: 'Episode not found.',
      retryable: false,
      context: { id: draft.id },
    });
  }
  if (current && current.showId !== draft.showId) {
    throw validationError('The current API does not permit moving an episode between shows.', {
      id: current.id,
      fromShowId: current.showId,
      toShowId: draft.showId,
    });
  }

  let saved = current
    ? await repository.updateEpisode(current.id, {
        title: draft.title,
        notes: draft.notes,
        episodeNumber: draft.episodeNumber,
        durationMinutes: draft.durationMinutes,
        premium: draft.premium,
      })
    : await repository.createEpisode({
        showId: draft.showId,
        title: draft.title,
        notes: draft.notes,
        episodeNumber: draft.episodeNumber,
        durationMinutes: draft.durationMinutes,
        premium: draft.premium,
      });

  if (draft.audioFile) {
    saved = await repository.uploadEpisodeAudio(saved.id, {
      body: draft.audioFile,
      fileName: draft.audioFile.name,
      contentType: draft.audioFile.type || undefined,
    });
  }

  const scheduledAt = draft.scheduledAt
    ? riyadhLocalInputToIso(draft.scheduledAt)
    : undefined;
  if (targetStatus === 'scheduled' && !scheduledAt) {
    throw validationError('Scheduling an episode requires a date and time.');
  }

  if (saved.status === targetStatus) {
    const scheduleChanged =
      targetStatus === 'scheduled' && scheduledAt !== saved.scheduledAt;
    if (scheduleChanged) {
      saved = await repository.transitionEpisode(saved.id, { status: 'draft' });
      await repository.transitionEpisode(saved.id, {
        status: 'scheduled',
        scheduledAt,
      });
    }
    return saved.id;
  }

  await repository.transitionEpisode(saved.id, {
    status: targetStatus,
    scheduledAt: targetStatus === 'scheduled' ? scheduledAt : undefined,
  });
  return saved.id;
}
