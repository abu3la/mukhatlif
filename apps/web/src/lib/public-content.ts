export function singleQuery(value: string | string[] | undefined, maximum = 160): string {
  return (Array.isArray(value) ? (value[0] ?? '') : (value ?? '')).trim().slice(0, maximum);
}

export const EPISODE_SORTS = ['latest', 'shortest', 'longest'] as const;
export type EpisodeSort = (typeof EPISODE_SORTS)[number];
export function episodeSort(value: string): EpisodeSort {
  return EPISODE_SORTS.includes(value as EpisodeSort) ? (value as EpisodeSort) : 'latest';
}

/** Chapters are extracted only from timestamped lines in published show notes. */
export function publishedChapters(
  notes: string,
  duration: number,
): Array<{ seconds: number; title: string }> {
  const seen = new Set<number>();
  return notes
    .split(/\r?\n/)
    .flatMap((line) => {
      const normalized = line.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
      const match =
        /^\s*(?:[-•*]\s*)?\(?((?:\d{1,2}:)?\d{1,3}:\d{2})\)?\s*[-–:،|]?\s*(\S.{1,200})\s*$/.exec(
          normalized,
        );
      if (!match) return [];
      const parts = match[1]!.split(':').map(Number);
      const seconds = parts.reduce((total, part) => total * 60 + part, 0);
      if (
        parts.slice(1).some((part) => part > 59) ||
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        seconds >= duration ||
        seen.has(seconds)
      )
        return [];
      seen.add(seconds);
      return [{ seconds, title: match[2]!.trim() }];
    })
    .sort((a, b) => a.seconds - b.seconds);
}
