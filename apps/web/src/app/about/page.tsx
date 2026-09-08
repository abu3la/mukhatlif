import type { Metadata } from 'next';
import Link from 'next/link';
import { ShowCard } from '@/components/cards';
import { ApiUnavailableError, listShows } from '@/lib/api';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'من نحن',
  description: 'مختلف، منصة إعلامية تضع المهنة والإنسان في قلب الحكاية.',
  alternates: { canonical: '/about' },
};
const team = [
  ['محمد بازيد', 'رئيس مجلس الإدارة'],
  ['أحمد عطار', 'المدير التنفيذي'],
  ['عماد ناجي', 'المدير الإداري'],
  ['محمد نعمان غريواتي', 'مدير العمليات'],
  ['محمد عبدالعزيز', 'مدير المحتوى'],
  ['عبدالرحمن عثمان', 'مدير التسويق'],
  ['علاء الدين عثمان', 'مسؤول المنصات'],
  ['عبدالرحمن معشي', 'معد البرامج'],
  ['أحمد نور', 'محرر الفيديوهات القصيرة'],
] as const;
export default async function AboutPage() {
  let shows: Awaited<ReturnType<typeof listShows>> = [];
  try {
    shows = (await listShows()).slice(0, 6);
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  return (
    <div className="content-page public-page">
      <div className="content-container">
        <header className="public-page-head">
          <h1>من نحن</h1>
          <p>مختلف، منصة إعلامية تضع المهنة والإنسان في قلب الحكاية.</p>
        </header>
        <section className="public-about-story" aria-labelledby="story-title">
          <h2 id="story-title">حكايتنا</h2>
          <p>
            اختارت مختلف المهنة وهمومها موضوعًا يجمع برامجها وحواراتها. ننطلق من أثر العمل في
            حياتنا، ونفتح مساحة للتجارب والأفكار التي تساعدنا على فهم مساراتنا المهنية.
          </p>
        </section>
        {shows.length ? (
          <div className="public-about-shows">
            {shows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </div>
        ) : null}
        <section className="public-mission" aria-labelledby="mission-title">
          <h2 id="mission-title">قضيتنا: لمسار مهني يشبهك.</h2>
          <p>
            نهدف إلى أن يعيش كل شخص يومًا مهنيًا يناسب قيمه وظروفه وإمكاناته، لذلك اخترنا المهنة
            وهمومها قضيتنا.
          </p>
          <Link href="/mission">اقرأ عن قضيتنا</Link>
        </section>
        <section id="team" className="public-team" aria-labelledby="team-title">
          <h2 id="team-title">من وراء مختلف</h2>
          <div>
            {team.map(([name, role]) => (
              <article key={name}>
                <h3>{name}</h3>
                <p>{role}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
