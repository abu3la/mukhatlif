import Link from 'next/link';
import { BrandIcon } from '@/components/brand-icon';
import { NEWSLETTERS } from '@/lib/communities';

/** Section 9: name, description, stated frequency, and «اكتشف النشرة». */
export function NewsletterCards({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="newsletter-cards" role="list">
      {NEWSLETTERS.map((newsletter) => (
        <div className="card-cell" role="listitem" key={newsletter.slug}>
          <Link className="newsletter-card" href={`/newsletters/${newsletter.slug}`}>
            <Heading className="newsletter-card__name">نشرة {newsletter.name}</Heading>
            {/* The frequency row keeps its height when unknown, so cards align. */}
            <span className="newsletter-card__frequency" aria-hidden={!newsletter.frequency}>
              {newsletter.frequency ?? '\u00a0'}
            </span>
            <span className="newsletter-card__text">{newsletter.description}</span>
            <span className="community-card__action">
              اكتشف النشرة
              <BrandIcon name="next" className="community-card__arrow" />
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}
