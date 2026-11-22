import type { CSSProperties } from 'react';
import Link from 'next/link';
import { PlatformMark } from '@/components/platform-mark';
import { Diamond, MazeDrawing } from '@/components/maze-drawing';
import { ARRIVAL_PHONE, ARRIVAL_WIDE, HERO_PHONE, HERO_WIDE, communityHero } from '@/lib/home-maze';
import {
  communityLogo,
  coverTone,
  findPresenter,
  findProgramme,
  programmeCover,
  programmeHref,
  type Community,
  type Programme,
} from '@/lib/communities';
import { SERVICES, STORY, TEAM } from '@/lib/site-facts';

/**
 * The presentation home of direction C (D-24): a night stage with a maze in
 * the language of the brand pattern, a white sheet that slides over it, and the
 * floor the footer stands on. Every piece here renders on the server; the
 * manifesto and the community picker are the only client islands.
 */

export function HomeHero() {
  return (
    <section className="stage-hero" aria-labelledby="home-title">
      <MazeDrawing maze={HERO_WIDE} variant="wide" />
      <MazeDrawing maze={HERO_PHONE} variant="phone" />
      <h1 id="home-title" className="stage-hero__title">
        <span className="stage-hero__line">لمسار مهني</span>{' '}
        <span className="stage-hero__line stage-hero__line--end">
          يشبهك
          <Diamond className="stage-hero__stop" />
        </span>
      </h1>
      <p className="stage-hero__lede">
        حوارات عن المهن والناس الذين يمارسونها، في أكثر من 30 برنامجًا.
      </p>
    </section>
  );
}

/**
 * A community's stage (D-24): the route that left the home headline arrives
 * at the community's name and ends at its full stop. The name's size and the
 * route's last point come from its measured width (communityHero).
 */
export function CommunityHero({ community, fact }: { community: Community; fact?: string }) {
  const hero = communityHero(community.slug, community.name);
  const size = {
    '--hero-fs': hero.sizes.wide,
    '--hero-fs-phone': hero.sizes.phone,
  } as CSSProperties;
  return (
    <section className="community-hero" aria-labelledby="community-title" style={size}>
      {/* Drawn with the home hero's maze pieces, in its two compositions. */}
      <MazeDrawing maze={{ ...ARRIVAL_WIDE, route: hero.wide }} variant="wide" />
      <MazeDrawing maze={{ ...ARRIVAL_PHONE, route: hero.phone }} variant="phone" />
      <h1 id="community-title" className="community-hero__title">
        {community.name}
        <Diamond className="stage-hero__stop" />
      </h1>
      <div className="community-hero__body">
        <p className="community-hero__lede">
          {community.description}
          {fact ? (
            <>
              {' '}
              <span className="community-hero__fact">{fact}.</span>
            </>
          ) : null}
        </p>
        <a className="stage-link" href={community.youtube} target="_blank" rel="noopener">
          <PlatformMark id="youtube" className="stage-link__mark" />
          تابع {community.name} على يوتيوب
          <span className="visually-hidden"> (يفتح في نافذة جديدة)</span>
        </a>
      </div>
    </section>
  );
}

const cover = (slug: string) => {
  const found = findProgramme(slug);
  return found ? { slug, name: found.programme.name, src: programmeCover(found.programme) } : null;
};

export function HomeStory() {
  return (
    <section className="home-story" aria-labelledby="home-story-title">
      <div className="content-container">
        <h2 id="home-story-title" className="stage-statement home-story__title">
          من برنامج واحد إلى أكثر من 30 برنامجًا.
        </h2>
        <div className="home-story__path">
          {/* The route carries on across the years: straight, with a step between stops. */}
          <svg
            className="home-story__line"
            viewBox="0 0 1312 60"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M1301 13H1040V45H990V13H704V45H654V13H368V45H318V13H0"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <ol className="home-story__stops">
            {STORY.map((stop, index) => (
              <li className="home-story__stop" key={stop.year}>
                {index < STORY.length - 1 ? (
                  <svg
                    className="home-story__step"
                    viewBox="0 0 40 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M20 0V42H31V58H20V100" vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : null}
                <Diamond className="home-story__dot" />
                <p className="home-story__year">{stop.year}</p>
                <p className="home-story__when">{stop.when}</p>
                <p className="home-story__text">{stop.text}</p>
                {stop.programmes ? (
                  <ul className="home-story__covers" aria-label="أول برامج مختلف">
                    {stop.programmes.map(cover).map((item) =>
                      item ? (
                        <li key={item.slug}>
                          <Link href={`/programmes/${item.slug}`}>
                            <img
                              src={item.src}
                              alt={item.name}
                              width="96"
                              height="96"
                              loading="lazy"
                              decoding="async"
                            />
                          </Link>
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export const presenterLine = (programme: Programme) => {
  const names = programme.presenters
    .map((slug) => findPresenter(slug)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? `تقديم ${names.join(' و')}` : '';
};

/** A programme as the rails show it: the whole cover, its name, approved line and hosts. */
export function ProgrammeTile({ programme }: { programme: Programme }) {
  const hosts = presenterLine(programme);
  return (
    <li className="programme-tile" data-tone={coverTone(programme)}>
      <Link className="programme-tile__link" href={programmeHref(programme)}>
        <img
          className="programme-tile__cover"
          src={programmeCover(programme)}
          alt=""
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
        />
        <span className="programme-tile__name">{programme.name}</span>
        <span className="programme-tile__text">{programme.description}</span>
        {/* The hosts line keeps its height when a presenter is not confirmed yet. */}
        <span className="programme-tile__hosts" aria-hidden={!hosts}>
          {hosts || ' '}
        </span>
      </Link>
    </li>
  );
}

export function ProgrammeRail({
  programmes,
  id,
  label,
}: {
  programmes: readonly Programme[];
  id: string;
  label: string;
}) {
  return (
    <ul id={id} className="stage-rail stage-rail--programmes" aria-label={label} tabIndex={0}>
      {programmes.map((programme) => (
        <ProgrammeTile key={programme.slug} programme={programme} />
      ))}
    </ul>
  );
}

/** The phone and tablet form of «أي مسار يشبهك؟»: one slide per community. */
export function CommunitySlides({ communities, id }: { communities: Community[]; id: string }) {
  return (
    <ul
      id={id}
      className="stage-rail stage-rail--communities"
      aria-label="مجتمعات مختلف"
      tabIndex={0}
    >
      {communities.map((community) => {
        const shown = community.programmes.slice(0, 5);
        const more = community.programmes.length - shown.length;
        return (
          <li className="community-slide" key={community.slug}>
            <img
              className="community-slide__logo"
              src={communityLogo(community)}
              alt=""
              width="400"
              height="400"
              loading="lazy"
              decoding="async"
            />
            <h3 className="community-slide__name">{community.name}</h3>
            <p className="community-slide__text">{community.description}</p>
            {shown.length ? (
              <ul className="community-slide__covers" aria-label={`برامج ${community.name}`}>
                {shown.map((programme) => (
                  <li key={programme.slug}>
                    <Link href={programmeHref(programme)}>
                      <img
                        src={programmeCover(programme)}
                        alt={programme.name}
                        width="96"
                        height="96"
                        loading="lazy"
                        decoding="async"
                      />
                    </Link>
                  </li>
                ))}
                {more > 0 ? (
                  <li className="community-slide__more">
                    <bdi>{more}+</bdi>
                  </li>
                ) : null}
              </ul>
            ) : (
              <div className="community-slide__covers" aria-hidden="true" />
            )}
            <Link className="stage-link" href={`/communities/${community.slug}`}>
              ادخل المجتمع
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function HomeServices() {
  return (
    <section className="home-services" aria-labelledby="home-services-title">
      <div className="content-container">
        <h2 id="home-services-title" className="stage-statement">
          لفكرتك، شكل يستحقها.
        </h2>
        <p className="home-services__lede">
          حدد ما تحتاجه، وساعدنا على فهم ما تريد قوله. نسجّل في استوديوهاتنا في الرياض وجدة.
        </p>
        <div className="home-services__rows">
          {SERVICES.map(([title, text]) => (
            <div className="home-service" key={title}>
              <h3 className="home-service__name">{title}</h3>
              <p className="home-service__text">{text}</p>
              <Link
                className="stage-link"
                href={'/prodservice?service=' + encodeURIComponent(title)}
                aria-label={'اطلب إنتاج ' + title}
              >
                ابدأ بهذا الشكل
              </Link>
            </div>
          ))}
        </div>
        <div className="home-services__actions">
          <Link className="public-primary" href="/prodservice">
            اطلب إنتاجًا
          </Link>
          <Link className="stage-link" href="/work">
            استعرض أعمالنا
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomeCredits() {
  return (
    <section className="home-credits" aria-labelledby="home-credits-title">
      <div className="content-container">
        <h2 id="home-credits-title" className="home-credits__title">
          من وراء مختلف
        </h2>
        <dl className="home-credits__list">
          {TEAM.map(([name, role]) => (
            <div className="home-credits__row" key={name}>
              <dt>{role}</dt>
              <dd>{name}</dd>
            </div>
          ))}
        </dl>
        <p className="home-credits__more">
          <Link className="stage-link" href="/presenters">
            تعرّف على مقدّمي برامجنا
          </Link>
        </p>
      </div>
    </section>
  );
}

export { Diamond };
