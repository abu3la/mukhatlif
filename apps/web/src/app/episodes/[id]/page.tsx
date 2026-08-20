import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Episode, Show } from '@mukhtalif/types';
import { Signal } from '@/components/signal';
import { dateTimeAttribute, formatDate, formatDuration, formatNumber } from '@/components/formatting';
import { ApiUnavailableError, NotFoundError, getEpisode, getShow } from '@/lib/api';

export const revalidate = 60;

type Params = { params: Promise<{ id: string }> };

async function loadEpisode(id: string): Promise<Episode> {
  try {
    return await getEpisode(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  try {
    // Deliberately not loadEpisode: notFound() throws a control-flow signal that
    // a catch here would swallow, leaving the 404 page wearing an episode title.
    const episode = await getEpisode(id);
    return {
      title: episode.titleAr,
      description: episode.showNotesAr.slice(0, 300),
      alternates: { canonical: `/episodes/${episode.id}` },
    };
  } catch (error) {
    if (error instanceof NotFoundError) return { title: 'الصفحة غير موجودة' };
    return { title: 'الحلقة' };
  }
}

export default async function EpisodePage({ params }: Params) {
  const { id } = await params;
  const episode = await loadEpisode(id);

  // The show is supporting context: a failure here must not lose the episode.
  let show: Show | null = null;
  try {
    show = await getShow(episode.showId);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError) && !(error instanceof NotFoundError)) throw error;
  }

  const duration = formatDuration(episode.durationSec);

  return (
    <article className="shell article">
      <header className="article__header">
        {show ? (
          <p className="hero__station">
            <Signal />
            <Link href={`/shows/${encodeURIComponent(show.slug)}`}>{show.titleAr}</Link>
          </p>
        ) : null}
        <h1 className="article__title">{episode.titleAr}</h1>
        <p className="article__byline">
          {[
            `الحلقة ${formatNumber(episode.episodeNumber)}`,
            duration,
            episode.publishAt ? formatDate(episode.publishAt) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {episode.publishAt ? (
          <time className="visually-hidden" dateTime={dateTimeAttribute(episode.publishAt)}>
            {formatDate(episode.publishAt)}
          </time>
        ) : null}
      </header>

      {episode.premium ? (
        <p className="badge badge--premium" style={{ marginBlockEnd: 'var(--space-lg)' }}>
          <Signal />
          هذه الحلقة تتطلب اشتراكًا للاستماع
        </p>
      ) : null}

      {episode.showNotesAr ? (
        <div className="prose">
          {episode.showNotesAr
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      ) : (
        <p className="hero__lede">لا توجد ملاحظات منشورة لهذه الحلقة.</p>
      )}
    </article>
  );
}
