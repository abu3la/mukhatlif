import Link from 'next/link';
import { NEWSLETTERS, type Newsletter } from '@/lib/communities';

/** Section 9: name, description, stated frequency, and «اكتشف النشرة». */
export function NewsletterCards({
  headingLevel = 3,
  newsletters = NEWSLETTERS,
}: {
  headingLevel?: 2 | 3;
  newsletters?: readonly Newsletter[];
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="newsletter-cards" role="list">
      {newsletters.map((newsletter) => (
        <div className="card-cell" role="listitem" key={newsletter.slug}>
          <Link className="newsletter-card" href={`/newsletters/${newsletter.slug}`}>
            <Heading className="newsletter-card__name">نشرة {newsletter.name}</Heading>
            {/* The frequency row keeps its height when unknown, so cards align. */}
            <span className="newsletter-card__frequency" aria-hidden={!newsletter.frequency}>
              {newsletter.frequency ?? '\u00a0'}
            </span>
            <span className="newsletter-card__text">{newsletter.description}</span>
            <span className="community-card__action">اكتشف النشرة</span>
          </Link>
        </div>
      ))}
    </div>
  );
}
