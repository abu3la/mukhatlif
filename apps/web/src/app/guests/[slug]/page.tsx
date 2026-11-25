import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isYouTubeVideoId, type PublicGuestProfile, type Show } from '@mukhtalif/types';
import { BrandIcon } from '@/components/brand-icon';
import { EpisodeCard } from '@/components/cards';
import { EpisodeLibraryActions } from '@/components/episode-library-actions';
import {
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from '@/components/formatting';
import { guestAppearanceLabel, guestSocialHref, guestSocialLabel } from '@/components/guest-utils';
import { PlayEpisodeButton, type PlayerEpisode } from '@/components/player';
import { EmptyState } from '@/components/states';
import { YouTubeStill } from '@/components/youtube-still';
import { ApiUnavailableError, NotFoundError, getGuestProfile, listShows } from '@/lib/api';
import { showFace, showHref } from '@/lib/communities';
import { publicEpisodeAudioSrc } from '@/lib/player-source';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

async function loadGuestProfile(slug: string): Promise<PublicGuestProfile> {
  try {
    return await getGuestProfile(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const profile = await getGuestProfile(slug);
    const description =
      profile.guest.bio || [profile.guest.role, profile.guest.city].filter(Boolean).join('، ');
    return {
      title: profile.guest.name,
      description: description.slice(0, 300),
      alternates: { canonical: `/guests/${encodeURIComponent(profile.guest.slug)}` },
      openGraph: {
        title: profile.guest.name,
        description: description.slice(0, 300),
        images: profile.guest.photoUrl ? [profile.guest.photoUrl] : undefined,
      },
    };
  } catch (error) {
    if (error instanceof NotFoundError) return { title: 'الصفحة غير موجودة' };
    return { title: 'الضيف' };
  }
}

/**
 * A guest on the presentation site (D-24). Who they are and what they do
 * stand on the night stage; the newest conversation they had with us crosses
 * onto the sheet as its still and is introduced there, then what they wrote
 * about themselves and the rest of their episodes.
 */
export default async function GuestProfilePage({ params }: Params) {
  const { slug } = await params;
  const profile = await loadGuestProfile(slug);
  const { guest, episodes } = profile;

  // Programme names and covers are supporting context: a failure keeps the guest page.
  let shows: Show[] = [];
  try {
    shows = await listShows();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  const byId = new Map(shows.map((show) => [show.id, show]));

  const socialLinks = profile.socials.flatMap((social) => {
    const href = guestSocialHref(social);
    return href ? [{ social, href }] : [];
  });
  const bioParagraphs = guest.bio
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const featured = episodes.find(
    (episode) => !episode.premium && isYouTubeVideoId(episode.youtubeVideoId),
  );
  const featuredShow = featured ? byId.get(featured.showId) : undefined;
  const featuredHref = featured ? `/episodes/${encodeURIComponent(featured.id)}` : '';
  const featuredAudio = featured ? publicEpisodeAudioSrc(featured.id) : null;
  const featuredPlayer: PlayerEpisode | null =
    featured && featuredAudio
      ? {
          id: featured.id,
          title: featured.titleAr,
          showTitle: featuredShow ? showFace(featuredShow).name : undefined,
          href: featuredHref,
          durationSec: featured.durationSec,
          audioSrc: featuredAudio,
          youtubeVideoId: featured.youtubeVideoId,
          artworkUrl: `https://i.ytimg.com/vi/${featured.youtubeVideoId}/hqdefault.jpg`,
        }
      : null;
  const featuredDuration = featured ? formatDuration(featured.durationSec) : '';
  // With one episode the crossing still already introduces it; the list is for the rest.
  const listed = featured && episodes.length === 1 ? [] : episodes;

  return (
    <div className={'stage-page guest-page' + (featured ? ' has-cross' : '')}>
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="guest-title">
          <div className="content-container stage-head">
            <p className="stage-head__crumbs">
              <Link href="/guests">الضيوف</Link>
            </p>
            {guest.photoUrl ? (
              <img
                className="guest-stage__photo"
                src={guest.photoUrl}
                alt={`صورة ${guest.name}`}
                width="240"
                height="240"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <h1 id="guest-title" className="stage-head__title">
              {guest.name}
            </h1>
            {guest.role ? <p className="stage-head__lede">{guest.role}</p> : null}
            <p className="stage-head__meta">
              {guest.city ? <span>{guest.city}</span> : null}
              <span className="stage-head__strong">{guestAppearanceLabel(guest.episodeCount)}</span>
            </p>
            {socialLinks.length ? (
              <nav className="guest-stage__socials" aria-label={`حسابات ${guest.name}`}>
                <ul>
                  {socialLinks.map(({ social, href }) => (
                    <li key={`${social.platform}:${social.handle}`}>
                      <a className="stage-link" href={href} rel="me">
                        {/* One run of text, so the underline runs on under the handle. */}
                        <span>
                          {guestSocialLabel(social.platform)}{' '}
                          <bdi className="guest-stage__handle" dir="ltr">
                            {social.handle}
                          </bdi>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
          {featured ? (
            <Link className="stage-cross" href={featuredHref} tabIndex={-1} aria-hidden="true">
              <YouTubeStill videoId={featured.youtubeVideoId} priority />
            </Link>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {featured ? (
            <article
              className="content-container stage-feature stage-feature--episode"
              aria-labelledby="featured-title"
            >
              <p className="stage-head__crumbs">
                {featuredShow ? (
                  <Link href={showHref(featuredShow.slug)}>{showFace(featuredShow).name}</Link>
                ) : null}
                <span className="stage-head__accent">
                  الحلقة {formatNumber(featured.episodeNumber)}
                </span>
              </p>
              <h2 className="stage-feature__title" id="featured-title">
                <Link href={featuredHref}>{featured.titleAr}</Link>
              </h2>
              <p className="stage-head__meta stage-feature__meta">
                {featured.publishAt ? (
                  <time dateTime={dateTimeAttribute(featured.publishAt)}>
                    {formatDate(featured.publishAt)}
                  </time>
                ) : null}
                {featuredDuration ? (
                  <span className="stage-head__icon-text">
                    <BrandIcon name="clock" />
                    <bdi>{featuredDuration}</bdi>
                  </span>
                ) : null}
              </p>
              <div className="stage-head__actions">
                {featuredPlayer ? (
                  <>
                    <PlayEpisodeButton episode={featuredPlayer} variant="label" />
                    <EpisodeLibraryActions episode={featuredPlayer} compact />
                  </>
                ) : (
                  <Link className="public-primary" href={featuredHref}>
                    تفاصيل الحلقة
                  </Link>
                )}
              </div>
            </article>
          ) : null}

          {bioParagraphs.length ? (
            <section className="content-container episode-read" aria-labelledby="guest-bio-title">
              <h2 className="cover-section__title" id="guest-bio-title">
                عن الضيف
              </h2>
              <div className="episode-read__body">
                {bioParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}

          {listed.length || !episodes.length ? (
            <section className="content-container" aria-labelledby="guest-episodes-title">
              <h2 className="cover-section__title" id="guest-episodes-title">
                حلقات {guest.name}
              </h2>
              {listed.length ? (
                <div className="listen-cards" role="list">
                  {listed.map((episode) => {
                    const show = byId.get(episode.showId);
                    return (
                      <EpisodeCard
                        key={episode.id}
                        episode={episode}
                        showName={show ? showFace(show).name : undefined}
                        showArtwork={show?.artworkUrl}
                      />
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="لا حلقات منشورة على يوتيوب بعد"
                  text="ستظهر هنا حلقات مختلف المنشورة على يوتيوب التي شارك فيها هذا الضيف."
                />
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
