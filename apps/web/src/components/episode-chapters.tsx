'use client';

import { useState } from 'react';
import type { PlayerEpisode } from './player';
import { useEpisodePosition } from './episode-position';

function timestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    rest = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export function EpisodeChapters({
  chapters,
  episode,
  videoId,
}: {
  chapters: Array<{ seconds: number; title: string }>;
  episode: PlayerEpisode | null;
  videoId?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const position = useEpisodePosition(episode, videoId);
  const normalize = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u064b-\u065f]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .toLowerCase();
  const results = chapters.filter((chapter) =>
    normalize(chapter.title).includes(normalize(search)),
  );
  function seek(seconds: number) {
    setSelected(seconds);
    position.seek(seconds);
  }
  return (
    <section className="public-chapters" aria-labelledby="chapters-title">
      <h2 id="chapters-title">فصول الحلقة</h2>
      <p>انتقل إلى الموضوع الذي يهمك.</p>
      <label htmlFor="chapter-search">ابحث في عناوين الفصول</label>
      <input
        id="chapter-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="كلمة من عناوين الفصول"
      />
      <div className="public-chapters__list">
        {results.length ? (
          results.map((chapter) => (
            <button
              key={chapter.seconds}
              type="button"
              onClick={() => seek(chapter.seconds)}
              aria-pressed={selected === chapter.seconds}
            >
              <bdi>{timestamp(chapter.seconds)}</bdi>
              <span>{chapter.title}</span>
            </button>
          ))
        ) : (
          <p role="status">لا يوجد فصل بهذا العنوان. جرّب كلمة أخرى.</p>
        )}
      </div>
    </section>
  );
}
