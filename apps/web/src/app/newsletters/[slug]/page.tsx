import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NEWSLETTERS } from '@/lib/communities';

type Params = { params: Promise<{ slug: string }> };

const find = (slug: string) => NEWSLETTERS.find((newsletter) => newsletter.slug === slug);

export function generateStaticParams() {
  return NEWSLETTERS.map((newsletter) => ({ slug: newsletter.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const newsletter = find((await params).slug);
  if (!newsletter) return { title: 'الصفحة غير موجودة' };
  return {
    title: `نشرة ${newsletter.name}`,
    description: newsletter.description,
    alternates: { canonical: `/newsletters/${newsletter.slug}` },
  };
}

export default async function NewsletterPage({ params }: Params) {
  const newsletter = find((await params).slug);
  if (!newsletter) notFound();
  return (
    <div className="content-page public-page">
      <div className="content-container newsletter-landing">
        <Link className="public-back" href="/articles#newsletters">
          النشرات
        </Link>
        <header className="public-page-head">
          <h1>نشرة {newsletter.name}</h1>
          <p>{newsletter.description}</p>
        </header>
        {newsletter.frequency ? (
          <p className="newsletter-landing__frequency">
            <span>تصلك</span> {newsletter.frequency}
          </p>
        ) : null}
        {/*
          Each newsletter has its own list on the current site. Until those lists
          are connected here, the subscription happens on that page, so nobody is
          added to the wrong list.
        */}
        <a className="public-primary" href={newsletter.subscribeUrl}>
          اشترك في النشرة
        </a>
      </div>
    </div>
  );
}
