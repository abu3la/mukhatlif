import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  webBreakpoints,
  webColorGroups,
  webFont,
  webLayout,
  webLeading,
  webMotion,
  webRadius,
  webSpace,
  webText,
  webWeight,
  type ThemedToken,
} from '@mukhtalif/design-tokens';
import { BrandIcon } from '@/components/brand-icon';
import { ArticleCard, EpisodeCard, ShowCard } from '@/components/cards';
import { CustomerField } from '@/components/customer-ui';
import { Pager, parsePage } from '@/components/pager';
import { ShareButton } from '@/components/public-content-controls';
import { CardSkeletonGrid, EmptyState, ErrorState, RowSkeletonList } from '@/components/states';
import { ThemeControl } from '@/components/theme-control';
import { listArticles, listEpisodes, listShows } from '@/lib/api';
import { isSearchIndexingEnabled } from '@/lib/config';
import styles from './design-system.module.css';

export const metadata: Metadata = {
  title: 'نظام التصميم',
  robots: { index: false, follow: false },
};

const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const sections = [
  ['colour', 'الألوان'],
  ['type', 'الخط'],
  ['space', 'المسافات والزوايا'],
  ['actions', 'الإجراءات'],
  ['fields', 'الحقول'],
  ['content', 'البطاقات والقوائم'],
  ['states', 'الحالات'],
] as const;

const filterDemo = [
  ['all', 'الكل'],
  ['careers', 'المسار المهني'],
  ['stories', 'قصص'],
] as const;

function Token({ children }: { children: string }) {
  return (
    <code className={styles.token} dir="ltr">
      {children}
    </code>
  );
}

function Specimen({
  title,
  names,
  source,
  children,
}: {
  title: string;
  names: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={styles.specimen}>
      <div className={styles.stage}>{children}</div>
      <figcaption className={styles.caption}>
        <span className={styles.captionTitle}>{title}</span>
        <Token>{names}</Token>
        <span className={styles.source} dir="ltr">
          {source}
        </span>
      </figcaption>
    </figure>
  );
}

function Swatch({ name, token }: { name: string; token: ThemedToken }) {
  const cssName = `--mk-${kebab(name)}`;
  return (
    <li className={styles.swatch}>
      <span className={styles.chip} style={{ background: `var(${cssName})` }} aria-hidden="true" />
      <span className={styles.swatchName}>{token.label}</span>
      <Token>{cssName}</Token>
      <span className={styles.values} dir="ltr">
        {token.light === token.dark ? token.light : `${token.light} / ${token.dark}`}
      </span>
    </li>
  );
}

export default async function DesignSystemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A working reference for the team; the indexed public site never serves it.
  if (isSearchIndexingEnabled()) notFound();
  const params = await searchParams;
  const demo = typeof params.demo === 'string' ? params.demo : 'all';
  const page = parsePage(params.page);
  const [shows, episodes, articles] = await Promise.allSettled([
    listShows(),
    listEpisodes({ perPage: 3 }),
    listArticles({ perPage: 2 }),
  ]);
  const showNames = new Map(
    shows.status === 'fulfilled' ? shows.value.map((show) => [show.id, show.titleAr]) : [],
  );

  return (
    <div className="content-page">
      <div className={`content-container ${styles.layout}`}>
        <header className={styles.head}>
          <h1 className={styles.title}>نظام تصميم مختلف</h1>
          <p className={styles.lead}>
            كل لون ومقاس هنا يأتي من <Token>libs/design-tokens/src/web.ts</Token>. عند طلب أي تعديل
            اذكر اسم التوكن أو المكوّن كما يظهر تحته.
          </p>
          <div className={styles.headActions}>
            <ThemeControl />
            <ShareButton title="نظام التصميم" path="/design-system" />
          </div>
        </header>

        <nav className={styles.index} aria-label="أقسام نظام التصميم">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        <div className={styles.body}>
          <section id="colour" className={styles.section} aria-labelledby="colour-title">
            <h2 id="colour-title" className={styles.sectionTitle}>
              الألوان
            </h2>
            <p className={styles.note}>
              المربع يعرض المظهر الحالي. القيمتان بعد الشرطة المائلة للمظهر الفاتح ثم الداكن.
            </p>
            {Object.entries(webColorGroups).map(([key, group]) => (
              <div key={key} className={styles.group}>
                <h3 className={styles.groupTitle}>{group.label}</h3>
                <ul className={styles.swatches}>
                  {Object.entries(group.tokens as Record<string, ThemedToken>).map(
                    ([name, token]) => (
                      <Swatch key={name} name={name} token={token} />
                    ),
                  )}
                </ul>
              </div>
            ))}
          </section>

          <section id="type" className={styles.section} aria-labelledby="type-title">
            <h2 id="type-title" className={styles.sectionTitle}>
              الخط
            </h2>
            <p className={styles.note}>
              عائلة واحدة: {webFont.family.label}، باسم <Token>--mk-font</Token>.
            </p>
            <ul className={styles.scale}>
              {Object.entries(webText).map(([step, token]) => (
                <li key={step} className={styles.scaleRow}>
                  <span className={styles.sample} style={{ fontSize: `var(--mk-text-${step})` }}>
                    لمسار مهني يشبهك
                  </span>
                  <span className={styles.scaleMeta}>
                    {token.label}
                    <Token>{`--mk-text-${step}`}</Token>
                    <span dir="ltr">{token.value}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>الأوزان</h3>
              <ul className={styles.inlineList}>
                {Object.entries(webWeight).map(([name, token]) => (
                  <li key={name} className={styles.weight}>
                    <span style={{ fontWeight: `var(--mk-weight-${name})` }}>مختلف</span>
                    <span className={styles.scaleMeta}>
                      {token.label}
                      <Token>{`--mk-weight-${name}`}</Token>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>ارتفاع السطر</h3>
              <ul className={styles.inlineList}>
                {Object.entries(webLeading).map(([name, token]) => (
                  <li key={name} className={styles.weight}>
                    <span>
                      {token.label} <span dir="ltr">{token.value}</span>
                    </span>
                    <Token>{`--mk-leading-${name}`}</Token>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="space" className={styles.section} aria-labelledby="space-title">
            <h2 id="space-title" className={styles.sectionTitle}>
              المسافات والزوايا
            </h2>
            <ul className={styles.ruler}>
              {Object.entries(webSpace).map(([step, token]) => (
                <li key={step} className={styles.rulerRow}>
                  <span
                    className={styles.bar}
                    style={{ inlineSize: `var(--mk-space-${step})` }}
                    aria-hidden="true"
                  />
                  <Token>{`--mk-space-${step}`}</Token>
                  <span className={styles.scaleMeta} dir="ltr">
                    {token.value}
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>الزوايا</h3>
              <ul className={styles.radii}>
                {Object.entries(webRadius).map(([name, token]) => (
                  <li key={name} className={styles.radiusItem}>
                    <span
                      className={styles.radiusBox}
                      style={{ borderRadius: `var(--mk-radius-${kebab(name)})` }}
                      aria-hidden="true"
                    />
                    <span className={styles.swatchName}>{token.label}</span>
                    <Token>{`--mk-radius-${kebab(name)}`}</Token>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>التخطيط والحركة ونقاط التحوّل</h3>
              <dl className={styles.facts}>
                {Object.entries(webLayout).map(([name, token]) => (
                  <div key={name}>
                    <dt>{token.label}</dt>
                    <dd>
                      <Token>{`--mk-${kebab(name)}`}</Token>
                    </dd>
                  </div>
                ))}
                {Object.entries(webMotion).map(([name, token]) => (
                  <div key={name}>
                    <dt>مدة الحركة {token.label}</dt>
                    <dd>
                      <Token>{`--mk-duration-${name}`}</Token>
                    </dd>
                  </div>
                ))}
                {Object.values(webBreakpoints).map((token) => (
                  <div key={token.value}>
                    <dt>{token.label}</dt>
                    <dd dir="ltr">{token.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section id="actions" className={styles.section} aria-labelledby="actions-title">
            <h2 id="actions-title" className={styles.sectionTitle}>
              الإجراءات
            </h2>
            <div className={styles.specimens}>
              <Specimen title="إجراء أساسي" names=".public-primary" source="app/public-pages.css">
                <Link className="public-primary" href="/episodes">
                  كل الحلقات
                </Link>
              </Specimen>
              <Specimen
                title="إجراء أساسي في الحساب"
                names=".customer-primary"
                source="components/customer.css"
              >
                <Link className="customer-primary" href="/library">
                  مكتبتي
                </Link>
              </Specimen>
              <Specimen
                title="إجراء نصي"
                names=".public-text-action (ShareButton)"
                source="app/public-pages.css"
              >
                <ShareButton title="نظام التصميم" path="/design-system" />
              </Specimen>
              <Specimen title="إجراء بأيقونة" names=".icon-action" source="app/handoff.css">
                <Link className="icon-action" href="/search" aria-label="البحث">
                  <BrandIcon name="search" />
                </Link>
              </Specimen>
              <Specimen
                title="اختيار وتصفية"
                names=".public-filter-tabs"
                source="app/public-pages.css"
              >
                <nav className={`public-filter-tabs ${styles.flush}`} aria-label="مثال تصفية">
                  {filterDemo.map(([value, label]) => (
                    <Link
                      key={value}
                      href={`/design-system?demo=${value}#actions`}
                      aria-current={demo === value ? 'page' : undefined}
                      scroll={false}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </Specimen>
            </div>
          </section>

          <section id="fields" className={styles.section} aria-labelledby="fields-title">
            <h2 id="fields-title" className={styles.sectionTitle}>
              الحقول
            </h2>
            <div className={styles.specimens}>
              <Specimen title="حقل" names="CustomerField" source="components/customer-ui.tsx">
                <div className={styles.fieldStage}>
                  <CustomerField name="ds-name" label="الاسم" placeholder="اسمك" />
                </div>
              </Specimen>
              <Specimen
                title="حقل مع تلميح"
                names="CustomerField hint"
                source="components/customer-ui.tsx"
              >
                <div className={styles.fieldStage}>
                  <CustomerField
                    name="ds-email"
                    type="email"
                    label="البريد الإلكتروني"
                    hint="نرسل إليه رابط التأكيد فقط."
                  />
                </div>
              </Specimen>
              <Specimen
                title="حقل فيه خطأ"
                names="CustomerField error"
                source="components/customer.css"
              >
                <div className={styles.fieldStage}>
                  <CustomerField
                    name="ds-phone"
                    label="رقم الجوال"
                    defaultValue="05"
                    error="أدخل رقماً صحيحاً من عشر خانات."
                  />
                </div>
              </Specimen>
            </div>
          </section>

          <section id="content" className={styles.section} aria-labelledby="content-title">
            <h2 id="content-title" className={styles.sectionTitle}>
              البطاقات والقوائم
            </h2>
            <p className={styles.note}>
              محتوى حقيقي من المنصة، بالمكوّنات نفسها التي تستخدمها الصفحات.
            </p>
            {shows.status === 'fulfilled' && episodes.status === 'fulfilled' ? (
              <>
                <div className={styles.group}>
                  <h3 className={styles.groupTitle}>
                    بطاقة برنامج <Token>ShowCard</Token>
                  </h3>
                  <div className="shows-grid">
                    {shows.value.slice(0, 3).map((show) => (
                      <ShowCard key={show.id} show={show} />
                    ))}
                  </div>
                </div>
                <div className={styles.group}>
                  <h3 className={styles.groupTitle}>
                    بطاقة حلقة <Token>EpisodeCard</Token>
                  </h3>
                  <div className="public-episode-grid" role="list">
                    {episodes.value.items.map((episode) => (
                      <EpisodeCard
                        key={episode.id}
                        episode={episode}
                        showName={showNames.get(episode.showId)}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <ErrorState />
            )}
            {articles.status === 'fulfilled' && articles.value.items.length ? (
              <div className={styles.group}>
                <h3 className={styles.groupTitle}>
                  بطاقة مقال <Token>ArticleCard</Token>
                </h3>
                <div className="articles-grid">
                  {articles.value.items.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>
                التنقل بين الصفحات <Token>Pager</Token>
              </h3>
              <Pager
                basePath="/design-system"
                pageInfo={{
                  page,
                  perPage: 1,
                  total: 3,
                  totalPages: 3,
                  hasPreviousPage: page > 1,
                  hasNextPage: page < 3,
                }}
              />
            </div>
          </section>

          <section id="states" className={styles.section} aria-labelledby="states-title">
            <h2 id="states-title" className={styles.sectionTitle}>
              الحالات
            </h2>
            <div className={styles.specimens}>
              <Specimen title="لا يوجد محتوى" names="EmptyState" source="components/states.tsx">
                <EmptyState title="لا توجد حلقات محفوظة" text="احفظ حلقة لتجدها هنا لاحقاً." />
              </Specimen>
              <Specimen title="تعذّر التحميل" names="ErrorState" source="components/states.tsx">
                <ErrorState />
              </Specimen>
            </div>
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>
                التحميل <Token>CardSkeletonGrid</Token> <Token>RowSkeletonList</Token>
              </h3>
              <CardSkeletonGrid count={4} />
              <RowSkeletonList count={2} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
