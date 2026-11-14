import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EpisodeCard } from '@/components/cards';
import { CommunityCrate, ProgrammeEntry } from '@/components/communities';
import { COMMUNITIES, communityLogo, findCommunity } from '@/lib/communities';
import { latestEpisodesOf } from '@/lib/community-episodes';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMMUNITIES.map((community) => ({ slug: community.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const community = findCommunity((await params).slug);
  if (!community) return { title: 'الصفحة غير موجودة' };
  return {
    title: community.name,
    description: community.description,
    alternates: { canonical: `/communities/${community.slug}` },
    openGraph: { images: [communityLogo(community)] },
  };
}

export default async function CommunityPage({ params }: Params) {
  const community = findCommunity((await params).slug);
  if (!community) notFound();
  const showSlugs = community.programmes.flatMap((p) => (p.showSlug ? [p.showSlug] : []));
  const latest = await latestEpisodesOf(showSlugs);
  const hasProgrammes = community.programmes.length > 0;

  return (
    <div className="content-page public-page community-page">
      <div className="content-container">
        <header className="community-head">
          <CommunityCrate community={community} size="head" />
          <div className="community-head__text public-page-head">
            <h1>{community.name}</h1>
            <p>{community.description}</p>
            <div className="community-head__actions">
              {hasProgrammes ? (
                <a className="public-primary" href="#programmes">
                  اكتشف برامجنا
                </a>
              ) : null}
              <a
                className="public-text-action"
                href={community.youtube}
                target="_blank"
                rel="noopener"
              >
                تابع {community.name} على يوتيوب
                <span className="visually-hidden"> (يفتح في نافذة جديدة)</span>
              </a>
            </div>
          </div>
        </header>

        {hasProgrammes ? (
          <section className="content-section" id="programmes" aria-labelledby="programmes-title">
            <div className="content-section__header">
              <h2 className="content-section__title" id="programmes-title">
                برامج البودكاست
              </h2>
            </div>
            <div className="programme-list">
              {community.programmes.map((programme) => (
                <ProgrammeEntry key={programme.slug} programme={programme} />
              ))}
            </div>
          </section>
        ) : null}

        {latest && latest.episodes.length ? (
          <section className="content-section" aria-labelledby="latest-title">
            <div className="content-section__header">
              <h2 className="content-section__title" id="latest-title">
                أحدث الحلقات
              </h2>
              <Link href="/episodes">كل الحلقات</Link>
            </div>
            <div className="public-episode-grid" role="list">
              {latest.episodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  showName={latest.shows.get(episode.showId)?.titleAr}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="content-section community-invite" aria-labelledby="invite-title">
          <div>
            <h2 className="community-invite__title" id="invite-title">
              مين ودّك نسمع قصته؟
            </h2>
            <p>رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار.</p>
          </div>
          <Link className="public-primary" href="/suggest">
            اقترح ضيفًا
          </Link>
        </section>
      </div>
    </div>
  );
}
