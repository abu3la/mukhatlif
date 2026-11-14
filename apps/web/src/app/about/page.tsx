import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandIcon } from '@/components/brand-icon';
import { COMMUNITIES } from '@/lib/communities';

export const metadata: Metadata = {
  title: 'من نحن',
  description: 'مختلف شبكة محتوى تضم مجتمعات متخصصة وبرامج بودكاست ومقالات ونشرات وورشًا تعليمية.',
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

export default function AboutPage() {
  return (
    <div className="content-page public-page">
      <div className="content-container about-page">
        <header className="public-page-head">
          <h1>من نحن</h1>
          <p>
            مختلف شبكة محتوى تضم مجتمعات متخصصة وبرامج بودكاست ومقالات ونشرات وورشًا تعليمية. نفتح
            مساحات للحوار، وننقل تجارب الناس ومعارفهم لمساعدتك على فهم مجالك واكتشاف مسار يشبهك.
          </p>
          <p className="about-page__group">مختلف إحدى شركات ماد قروب.</p>
        </header>

        <section className="public-mission" aria-labelledby="mission-title">
          <h2 id="mission-title">قضيتنا</h2>
          <p>
            نقضي جزءًا كبيرًا من حياتنا في العمل، وتنعكس تجاربنا فيه على حياتنا خارجه. لذلك نهتم
            بالمهن والناس الذين يمارسونها؛ بأسئلتهم، وتحدياتهم، والقرارات التي تشكّل مساراتهم.
          </p>
          <p>
            نفتح هذه الحوارات لتكتشف ما يناسب قيمك واهتماماتك وظروفك. هذا ما نعنيه بـ«مسار مهني
            يشبهك».
          </p>
        </section>

        <section className="public-about-story" aria-labelledby="story-title">
          <h2 id="story-title">قصتنا</h2>
          <div>
            <p>
              بدأت قصة مختلف في أكتوبر 2023، وانطلقت رسميًا في 14 أبريل 2024. كانت البداية مع
              بودكاست بترولي، ثم شغلة وغلاف، وبعدهما بارتشن. وتوسّعت مختلف لاحقًا لتضم أكثر من 30
              برنامج بودكاست.
            </p>
            <p>ومن استوديو مختلف في الرياض، توسّع حضورنا بإضافة استوديو في جدة عام 2025.</p>
          </div>
        </section>

        <section className="content-section" aria-labelledby="about-communities">
          <div className="content-section__header">
            <h2 className="content-section__title" id="about-communities">
              المجتمعات والبرامج
            </h2>
            <Link href="/communities">كل المجتمعات</Link>
          </div>
          <ul className="about-communities">
            {COMMUNITIES.map((community) => (
              <li key={community.slug}>
                <Link href={`/communities/${community.slug}`}>
                  <img src={`/communities/${community.slug}.jpg`} alt="" width="400" height="400" />
                  <span>{community.name}</span>
                </Link>
              </li>
            ))}
          </ul>
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
          <Link className="about-page__link" href="/presenters">
            تعرّف على مقدّمي برامجنا
            <BrandIcon name="next" className="community-card__arrow" />
          </Link>
        </section>

        <section className="content-section about-page__contact" aria-labelledby="about-contact">
          <h2 className="content-section__title" id="about-contact">
            تواصل معنا
          </h2>
          <p>
            اكتب لنا على <bdi dir="ltr">Info@mukhtalif.net</bdi>
          </p>
          <Link className="public-primary" href="/contact">
            تواصل مع مختلف
          </Link>
        </section>
      </div>
    </div>
  );
}
