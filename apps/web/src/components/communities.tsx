import Link from 'next/link';
import { BrandIcon } from '@/components/brand-icon';
import {
  communityLogo,
  findPresenter,
  programmeCover,
  programmeHref,
  programmesOf,
  type Community,
  type Presenter,
  type Programme,
} from '@/lib/communities';

const MAX_SLEEVES = 4;

const programmeCount = (count: number) =>
  count === 1 ? 'برنامج واحد' : count === 2 ? 'برنامجان' : `${count} برامج`;

/**
 * The community's channel mark in front, its programme covers stacked behind
 * like sleeves in a crate. Purely presentational; the card carries the names.
 */
export function CommunityCrate({
  community,
  size = 'card',
}: {
  community: Community;
  size?: 'card' | 'head';
}) {
  const sleeves = community.programmes.slice(0, MAX_SLEEVES);
  return (
    <span className={`community-crate community-crate--${size}`} aria-hidden="true">
      <img
        className="community-crate__sleeve community-crate__sleeve--logo"
        src={communityLogo(community)}
        alt=""
        width="400"
        height="400"
        loading="lazy"
        decoding="async"
      />
      {sleeves.map((programme, index) => (
        <img
          key={programme.slug}
          className="community-crate__sleeve"
          style={{ ['--i' as string]: index + 1 }}
          src={programmeCover(programme)}
          alt=""
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
        />
      ))}
    </span>
  );
}

export function CommunityCard({ community }: { community: Community }) {
  const count = community.programmes.length;
  return (
    <Link className="community-card" href={`/communities/${community.slug}`}>
      <CommunityCrate community={community} />
      <span className="community-card__body">
        <span className="community-card__name">{community.name}</span>
        {/* The count row keeps its height when there is no programme yet. */}
        <span className="community-card__count" aria-hidden={!count}>
          {count ? programmeCount(count) : '\u00a0'}
        </span>
        <span className="community-card__text">{community.description}</span>
        <span className="community-card__action">
          استكشف المجتمع
          <BrandIcon name="next" className="community-card__arrow" />
        </span>
      </span>
    </Link>
  );
}

export function CommunityGrid({ communities }: { communities: Community[] }) {
  return (
    <div className="community-grid" role="list">
      {communities.map((community) => (
        <div className="card-cell" role="listitem" key={community.slug}>
          <CommunityCard community={community} />
        </div>
      ))}
    </div>
  );
}

/** A programme with its cover, approved description and presenters. */
export function ProgrammeEntry({
  programme,
  headingLevel = 3,
}: {
  programme: Programme;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const external = !programme.showSlug;
  const presenters = programme.presenters
    .map(findPresenter)
    .filter((presenter): presenter is Presenter => Boolean(presenter));
  return (
    <article className="programme-entry">
      <a
        className="programme-entry__cover"
        href={programmeHref(programme)}
        tabIndex={-1}
        aria-hidden="true"
        {...(external ? { target: '_blank', rel: 'noopener' } : {})}
      >
        <img
          src={programmeCover(programme)}
          alt=""
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
        />
      </a>
      <div className="programme-entry__body">
        <Heading className="programme-entry__name">{programme.name}</Heading>
        <p className="programme-entry__text">{programme.description}</p>
        {presenters.length ? (
          <p className="programme-entry__hosts">
            <span>تقديم</span>{' '}
            {presenters.map((presenter, index) => (
              <span key={presenter.slug}>
                {index ? '، ' : ''}
                <Link href={`/presenters/${presenter.slug}`}>{presenter.name}</Link>
              </span>
            ))}
          </p>
        ) : null}
        {external ? (
          <a
            className="programme-entry__action"
            href={programmeHref(programme)}
            target="_blank"
            rel="noopener"
          >
            شاهد الحلقات على يوتيوب
            <span className="visually-hidden"> (يفتح في نافذة جديدة)</span>
            <BrandIcon name="up" className="programme-entry__out" />
          </a>
        ) : (
          <Link className="programme-entry__action" href={programmeHref(programme)}>
            استمع وشاهد الحلقات
            <BrandIcon name="next" className="community-card__arrow" />
          </Link>
        )}
      </div>
    </article>
  );
}

export function PresenterCard({ presenter }: { presenter: Presenter }) {
  const programmes = programmesOf(presenter.slug);
  return (
    <Link className="presenter-card" href={`/presenters/${presenter.slug}`}>
      <span className="presenter-card__covers" aria-hidden="true">
        {programmes.map(({ programme }) => (
          <img
            key={programme.slug}
            src={programmeCover(programme)}
            alt=""
            width="480"
            height="480"
            loading="lazy"
            decoding="async"
          />
        ))}
      </span>
      <span className="presenter-card__name">{presenter.name}</span>
      <span className="presenter-card__programmes">
        {programmes.map(({ programme }) => programme.name).join('، ')}
      </span>
      <span className="presenter-card__bio">{presenter.bio}</span>
      <span className="community-card__action">
        {presenter.feminine ? 'تعرّف عليها' : 'تعرّف عليه'}
        <BrandIcon name="next" className="community-card__arrow" />
      </span>
    </Link>
  );
}

/** The participation paths of section 18 that have a working form today. */
export const PARTICIPATION_PATHS = [
  {
    href: '/suggest',
    title: 'مين ودّك نسمع قصته؟',
    text: 'رشّح لنا شخصًا عنده تجربة أو معرفة تستحق نفتح حولها حوار.',
    action: 'اقترح ضيفًا',
  },
  {
    href: '/join-us',
    title: 'اشتغل مع مختلف',
    text: 'عرّفنا عليك وعلى خبراتك، وأرفق نماذج من أعمالك.',
    action: 'انضم لفريقنا',
  },
  {
    href: '/sponsor',
    title: 'تعاون مع مختلف',
    text: 'من رعاية برامجنا إلى إنتاج محتواك، نطوّر معك أفكارًا تخدم أهدافك وتصل إلى جمهورك.',
    action: 'ناقش فكرتك معنا',
  },
] as const;

export interface ParticipationPath {
  href: string;
  title: string;
  text: string;
  action: string;
}

export function ParticipationPaths({
  paths = PARTICIPATION_PATHS,
  headingLevel = 3,
}: {
  paths?: readonly ParticipationPath[];
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="participation-paths" role="list">
      {paths.map((path) => (
        <div className="card-cell" role="listitem" key={path.href}>
          <Link className="participation-path" href={path.href}>
            <Heading className="participation-path__title">{path.title}</Heading>
            <span className="participation-path__text">{path.text}</span>
            <span className="community-card__action">
              {path.action}
              <BrandIcon name="next" className="community-card__arrow" />
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}
