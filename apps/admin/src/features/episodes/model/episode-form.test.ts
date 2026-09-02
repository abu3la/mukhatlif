import { describe, expect, it } from 'vitest';
import { AdminRepositoryError } from '@/data';
import {
  getEpisodeOperationErrorMessage,
  normalizeEpisodeNumericInput,
  validateEpisodeAudioFile,
  validateEpisodeNumbers,
} from './episode-form';

describe('episode form validation', () => {
  it('converts typed numeric values to Latin digits before display', () => {
    expect(normalizeEpisodeNumericInput(' ٢٣ ')).toBe('23');
    expect(normalizeEpisodeNumericInput('۴۵٫۵')).toBe('45.5');
  });

  it('accepts Arabic-Indic digits for required numeric fields', () => {
    expect(validateEpisodeNumbers('٢٣', '٤٥٫٥')).toEqual({
      ok: true,
      episodeNumber: 23,
      durationMinutes: 45.5,
    });
  });

  it('requires a positive integer episode number', () => {
    expect(validateEpisodeNumbers('٠', '٤٥')).toMatchObject({
      ok: false,
      field: 'episodeNumber',
    });
    expect(validateEpisodeNumbers('٢٫٥', '٤٥')).toMatchObject({
      ok: false,
      field: 'episodeNumber',
    });
  });

  it('requires a supplied non-negative duration', () => {
    expect(validateEpisodeNumbers('٢٣', '')).toMatchObject({
      ok: false,
      field: 'durationMinutes',
    });
    expect(validateEpisodeNumbers('٢٣', '-١')).toMatchObject({
      ok: false,
      field: 'durationMinutes',
    });
    expect(validateEpisodeNumbers('٢٣', '٠')).toMatchObject({
      ok: true,
      durationMinutes: 0,
    });
  });

  it('rejects unsupported audio files and localizes repository failures', () => {
    expect(validateEpisodeAudioFile(new File(['notes'], 'notes.txt', { type: 'text/plain' }))).toBe(
      'اختر ملف MP3 أو WAV.',
    );

    const cause = new AdminRepositoryError({
      code: 'NETWORK',
      operation: 'transitionEpisode',
      message: 'Network request failed.',
      retryable: true,
    });
    expect(getEpisodeOperationErrorMessage(cause, 'transition')).toBe(
      'تعذّر الاتصال بالخادم. انتظر قليلًا ثم حاول مرة أخرى.',
    );
  });

  it('uses Latin digits in the audio size validation message', () => {
    const file = new File([], 'large.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(file, 'size', { value: 500 * 1024 * 1024 + 1 });

    expect(validateEpisodeAudioFile(file)).toBe(
      'حجم الملف أكبر من 500 م.ب. اختر ملفًا أصغر.',
    );
  });
});
