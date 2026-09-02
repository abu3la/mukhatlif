import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PublicGuestProfile } from '@mukhtalif/types';
import {
  dateTimeAttribute,
  formatDate,
  formatDuration,
  formatNumber,
} from '@/components/formatting';
import { GuestPortrait } from '@/components/guest-card';
import {
  guestAppearanceLabel,
  guestSocialHref,
  guestSocialLabel,
} from '@/components/guest-utils';
import { EmptyState } from '@/components/states';
import { NotFoundError, getGuestProfile } from '@/lib/api';

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

function GuestEpisodeLink({
  episode,
}: {
  episode: PublicGuestProfile['episodes'][number];
}) {
  const href = `/episodes/${encodeURIComponent(episode.id)}`;
  const publishedDate = episode.publishAt ? formatDate(episode.publishAt) : '';
  const duration = formatDuration(episode.durationSec);

  return (
    <div className="episode-row episode-row--link-only" role="listitem">
      <div className="episode-row__body">
        <Link className="episode-row__title" href={href}>
          <span className="visually-hidden">
            {`الحلقة ${formatNumber(episode.episodeNumber)}: `}
          </span>
          {episode.titleAr}
          {episode.premium ? (
            <>
              {' '}
              <span className="episode-row__premium">حصري</span>
            </>
          ) : null}
        </Link>
        {publishedDate ? (
          <span className="episode-row__meta">
            <time dateTime={dateTimeAttribute(episode.publishAt)}>{publishedDate}</time>
          </span>
        ) : null}
      </div>
      {duration ? <span className="episode-row__duration">{duration}</span> : null}
    </div>
  );
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

export default async function GuestProfilePage({ params }: Params) {
  const { slug } = await params;
  const profile = await loadGuestProfile(slug);
  const { guest } = profile;
  const socialLinks = profile.socials.flatMap((social) => {
    const href = guestSocialHref(social);
    return href ? [{ social, href }] : [];
  });
  const bioParagraphs = guest.bio
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="content-page guest-profile-page">
      <div className="content-container content-container--narrow">
        <nav className="guest-profile__breadcrumb" aria-label="مسار التنقل">
          <Link href="/guests">مكتبة الضيوف</Link>
        </nav>

        <article className="guest-profile">
          <header className="guest-profile__header">
            <GuestPortrait guest={guest} className="guest-profile__portrait" eager />
            <div className="guest-profile__identity">
              <h1 className="guest-profile__name">{guest.name}</h1>
              {guest.role ? <p className="guest-profile__role">{guest.role}</p> : null}
              <p className="guest-profile__meta">
                {[guest.city, guestAppearanceLabel(guest.episodeCount)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {socialLinks.length > 0 ? (
                <nav className="guest-socials" aria-label={`حسابات ${guest.name}`}>
                  <ul>
                    {socialLinks.map(({ social, href }) => (
                      <li key={`${social.platform}:${social.handle}`}>
                        <a href={href} rel="me">
                          <span>{guestSocialLabel(social.platform)}</span>
                          <span className="guest-socials__handle" dir="ltr">
                            {social.handle}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </div>
          </header>

          {bioParagraphs.length > 0 ? (
            <section className="guest-profile__bio" aria-labelledby="guest-bio-title">
              <h2 id="guest-bio-title">عن الضيف</h2>
              <div>
                {bioParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <section className="content-section guest-episodes" aria-labelledby="guest-episodes-title">
          <div className="content-section__header">
            <h2 className="content-section__title" id="guest-episodes-title">
              حلقات منشورة على يوتيوب شارك فيها
            </h2>
          </div>
          {profile.episodes.length > 0 ? (
            <div className="episode-list" role="list">
              {profile.episodes.map((episode) => (
                <GuestEpisodeLink key={episode.id} episode={episode} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="لا حلقات منشورة على يوتيوب بعد"
              text="ستظهر هنا حلقات مختلف المنشورة على يوتيوب التي شارك فيها هذا الضيف."
            />
          )}
        </section>
      </div>
    </div>
  );
}
