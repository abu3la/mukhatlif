import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './about.module.css';

const LISTENING_PLATFORMS = [
  {
    label: 'سبوتيفاي',
    href: 'https://open.spotify.com/show/6m9xb0r6xCBtTvq4UnnYbh',
  },
  {
    label: 'آبل بودكاست',
    href: 'https://podcasts.apple.com/sa/podcast/id1532674246',
  },
  {
    label: 'يوتيوب',
    href: 'https://www.youtube.com/channel/UC8vdjzu_0QMQlG9qNT5D_AQ',
  },
] as const;

type Presenter = {
  name: string;
  show: string;
  href?: string;
};

const PRESENTERS: readonly Presenter[] = [
  { name: 'أحمد عطار', show: 'بودكاست بترولي', href: '/shows/petroly' },
  { name: 'ماجد رشدي', show: 'بودكاست سيرة', href: '/shows/seera' },
  { name: 'محمد المرشدي', show: 'بودكاست غلاف', href: '/shows/gilaf' },
  { name: 'د. عادل رضوان', show: 'بودكاست مناوب' },
  { name: 'محمد الشيباني', show: 'بودكاست قضية' },
];

const TEAM = [
  { name: 'محمد بازيد', role: 'رئيس مجلس الإدارة' },
  { name: 'أحمد عطار', role: 'المدير التنفيذي' },
  { name: 'عماد ناجي', role: 'المدير الإداري' },
  { name: 'محمد نعمان غريواتي', role: 'مدير العمليات' },
  { name: 'محمد عبدالعزيز', role: 'مدير المحتوى' },
  { name: 'عبدالرحمن عثمان', role: 'مدير التسويق' },
  { name: 'علاء الدين عثمان', role: 'مسؤول المنصات' },
  { name: 'عبدالرحمن معشي', role: 'معد البرامج' },
  { name: 'أحمد نور', role: 'محرر الفيديوهات القصيرة' },
] as const;

const description =
  'تعرّف على قضية مختلف، مقدمي برامجها، والفريق الذي يصنع محتوى لمسار مهني يشبهك.';

export const metadata: Metadata = {
  title: { absolute: 'من نحن | مختلف' },
  description,
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'من نحن | مختلف',
    description,
  },
};

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <div className="content-container">
        <section className={styles.hero} aria-labelledby="about-title">
          <div className={styles.heroCopy}>
            <div className={styles.titleLine}>
              <span className={styles.mark} aria-hidden="true" />
              <h1 className={styles.title} id="about-title">
                من نحن
              </h1>
            </div>

            <p className={styles.statement}>المهنة وهمومها قضيتنا.</p>
            <p className={styles.mission}>
              نهدف إلى أن يعيش كل شخص يومًا مهنيًا يناسب قيمه وظروفه وإمكاناته، لذلك
              اخترنا المهنة وهمومها قضيتنا. مختلف، لمسار مهني يشبهك.
            </p>

            <nav className={styles.platforms} aria-label="منصات الاستماع">
              <span className={styles.platformsLabel}>استمع لنا عبر:</span>
              {LISTENING_PLATFORMS.map((platform) => (
                <a key={platform.href} className={styles.platformLink} href={platform.href}>
                  {platform.label}
                </a>
              ))}
            </nav>
          </div>

          <div className={styles.third}>
            <span className={styles.thirdValue} aria-hidden="true">
              ١ من ٣
            </span>
            <p className={styles.thirdText}>
              نقضي ثلث أعمارنا في أعمالنا، لذلك نؤمن بأن الشخص السعيد في عمله سعيد في
              حياته.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="presenters-title">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="presenters-title">
              مقدمو البرامج
            </h2>
            <Link className={styles.sectionLink} href="/shows">
              كل البرامج
            </Link>
          </div>
          <p className={styles.sectionIntro}>
            نحاور لنقدم محتوى يليق بذائقتكم ويقترب من أسئلتكم المهنية.
          </p>

          <ul className={styles.presenterList} role="list">
            {PRESENTERS.map((presenter) => (
              <li key={presenter.show} className={styles.presenterRow}>
                <span className={styles.presenterName}>{presenter.name}</span>
                <span className={styles.presenterShow}>{presenter.show}</span>
                {presenter.href ? (
                  <Link
                    className={styles.presenterLink}
                    href={presenter.href}
                    aria-label={`عرض ${presenter.show}`}
                  >
                    عرض البرنامج
                  </Link>
                ) : (
                  <span className={styles.comingSoon}>جاري البناء</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="team-title">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="team-title">
              فريق مختلف
            </h2>
          </div>
          <p className={styles.sectionIntro}>
            يعمل خلف كل برنامج فريق يجمع التحرير والإنتاج والتشغيل والتسويق.
          </p>

          <ul className={styles.teamList} role="list">
            {TEAM.map((member) => (
              <li key={member.name} className={styles.teamMember}>
                <span className={styles.teamName}>{member.name}</span>
                <span className={styles.teamRole}>{member.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
