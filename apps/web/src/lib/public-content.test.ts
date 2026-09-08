import { describe, expect, it } from 'vitest';
import { episodeSort, publishedChapters, singleQuery } from './public-content';

describe('published episode chapters', () => {
  it('extracts only timestamped published lines, handles Arabic digits and rejects impossible positions', () => {
    expect(
      publishedChapters(
        'مقدمة عن الحلقة\n00:00 البداية\n١٢:٣٥ سؤال العمل\n01:02:00 مسار جديد\n12:88 توقيت غير صالح\n99:00 خارج الحلقة\n12:35 مكرر',
        4500,
      ),
    ).toEqual([
      { seconds: 0, title: 'البداية' },
      { seconds: 755, title: 'سؤال العمل' },
      { seconds: 3720, title: 'مسار جديد' },
    ]);
  });
  it('does not invent chapters for prose-only show notes', () => {
    expect(publishedChapters('حوار عن العمل والحياة المهنية.', 3600)).toEqual([]);
  });
});

describe('public query filters', () => {
  it('bounds input and keeps unknown sort values on the safe default', () => {
    expect(singleQuery(['  بحث  ', 'ignored'])).toBe('بحث');
    expect(singleQuery('a'.repeat(300))).toHaveLength(160);
    expect(episodeSort('longest')).toBe('longest');
    expect(episodeSort('duration;drop')).toBe('latest');
  });
});
