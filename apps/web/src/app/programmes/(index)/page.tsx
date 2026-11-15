import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgrammeEntry } from '@/components/communities';
import { COMMUNITIES } from '@/lib/communities';

export const metadata: Metadata = {
  title: 'برامج البودكاست',
  description: 'لكل برنامج عالمه. اختر ما يشغلك، وتابع الحكاية.',
  alternates: { canonical: '/programmes' },
};

/** The programme directory of the site brief, grouped by community. */
export default function ProgrammesPage() {
  const communities = COMMUNITIES.filter((community) => community.programmes.length);
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>برامج البودكاست</h1>
          <p>لكل برنامج عالمه. اختر ما يشغلك، وتابع الحكاية.</p>
        </header>
        {communities.map((community) => (
          <section
            key={community.slug}
            className="content-section"
            aria-labelledby={`programmes-${community.slug}`}
          >
            <div className="content-section__header">
              <h2 className="content-section__title" id={`programmes-${community.slug}`}>
                {community.name}
              </h2>
              <Link href={`/communities/${community.slug}`}>
                استكشف المجتمع
                <span className="visually-hidden"> {community.name}</span>
              </Link>
            </div>
            <div className="programme-list">
              {community.programmes.map((programme) => (
                <ProgrammeEntry key={programme.slug} programme={programme} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
