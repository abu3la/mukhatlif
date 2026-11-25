import type { Metadata } from 'next';
import Link from 'next/link';
import type { CourseSummary } from '@mukhtalif/types';
import { BrandIcon } from '@/components/brand-icon';
import { CourseCover } from '@/components/course-cover';
import { LESSONS_NOUN, MINUTES_NOUN, countInWords } from '@/components/formatting';
import { Diamond } from '@/components/maze-drawing';
import { EmptyState, ErrorState } from '@/components/states';
import { ApiUnavailableError, getCourseOutline, listCourses, type CourseOutline } from '@/lib/api';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'أكاديمية مختلف',
  description:
    'ورش مسجلة تقدّم معرفة عملية من تجارب المتخصصين، وتساعدك تطبّق ما تتعلّمه في حياتك وعملك.',
  alternates: { canonical: '/courses' },
};

/** «كيف تتعلّم», section 16 of the site brief. */
const STEPS = [
  ['اختر ورشتك', 'تعرّف على محتواها ومدرّبها وشاهد المعاينة.'],
  ['اشترِ وابدأ', 'بعد اكتمال الدفع تظهر الورشة في «دوراتي».'],
  ['تعلّم بوقتك', 'شاهد الدروس، دوّن ملاحظاتك، وارجع من حيث توقفت.'],
] as const;

const price = (course: CourseSummary) => (course.price ? `${course.price} ر.س` : 'مجانية');
const courseHref = (course: CourseSummary) => `/courses/${encodeURIComponent(course.id)}`;

function Facts({ course }: { course: CourseSummary }) {
  return (
    <ul className="course-facts-line">
      {course.instructor ? (
        <li>
          <BrandIcon name="user" />
          تقديم {course.instructor}
        </li>
      ) : null}
      <li>
        <BrandIcon name="queue" />
        {countInWords(course.lessonCount, LESSONS_NOUN)}
      </li>
      {course.durationMinutes > 0 ? (
        <li>
          <BrandIcon name="clock" />
          {countInWords(course.durationMinutes, MINUTES_NOUN)}
        </li>
      ) : null}
      {course.level ? (
        <li>
          <BrandIcon name="level" />
          {course.level}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * «أكاديمية مختلف» of the presentation site (D-24). A course has no artwork,
 * so the first one's cover is drawn from its lessons and crosses onto the
 * sheet, where the course is introduced with its price and one action. Other
 * courses follow when there are any; «كيف تتعلّم» climbs the same route.
 */
export default async function CoursesPage() {
  let courses: CourseSummary[] | null = null;
  try {
    courses = await listCourses();
  } catch (error) {
    if (!(error instanceof ApiUnavailableError)) throw error;
  }
  // The feature introduces a course in its own words, so it takes the first
  // one that has a description; the others keep the catalogue's order.
  const list = courses ?? [];
  const featured = list.find((course) => course.description.trim()) ?? list[0];
  const others = list.filter((course) => course !== featured);
  let outline: CourseOutline | null = null;
  if (featured) {
    try {
      outline = await getCourseOutline(featured.id);
    } catch {
      // The cover then counts the lessons instead of naming them.
    }
  }
  const lessons = outline?.lessons.map((lesson) => lesson.title) ?? featured?.lessonCount ?? 0;

  return (
    <div className={'stage-page academy-page' + (featured ? ' has-cross' : '')}>
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="academy-title">
          <div className="content-container stage-head">
            <h1 id="academy-title" className="stage-statement">
              تعلّم مع أكاديمية مختلف
            </h1>
            <p className="stage-head__lede">
              ورش مسجلة تقدّم معرفة عملية من تجارب المتخصصين، وتساعدك تطبّق ما تتعلّمه في حياتك
              وعملك. اختر الورشة المناسبة لك، وتعلّم في الوقت الذي يناسبك.
            </p>
          </div>
          {featured ? (
            <Link
              className="stage-cross academy-cross"
              href={courseHref(featured)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <CourseCover title={featured.title} skill={featured.skill} lessons={lessons} large />
            </Link>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {courses === null ? (
            <div className="content-container">
              <ErrorState
                title="تعذّر تحميل الدورات"
                text="لم نتمكن من الوصول إلى الأكاديمية الآن. جرّب التحديث بعد قليل."
                retryHref="/courses"
              />
            </div>
          ) : !featured ? (
            <div className="content-container">
              <EmptyState
                title="لا توجد دورات منشورة بعد"
                text="ستظهر هنا ورش الأكاديمية فور نشرها."
              />
            </div>
          ) : (
            <article
              className="content-container stage-feature academy-feature"
              aria-labelledby="featured-course"
            >
              {featured.category || featured.skill ? (
                <p className="stage-head__crumbs">
                  {featured.category ? <span>{featured.category}</span> : null}
                  {featured.skill ? (
                    <span className="stage-head__accent">{featured.skill}</span>
                  ) : null}
                </p>
              ) : null}
              <h2 className="stage-feature__title" id="featured-course">
                <Link href={courseHref(featured)}>{featured.title}</Link>
              </h2>
              {featured.description ? (
                <p className="academy-feature__text">{featured.description}</p>
              ) : null}
              <Facts course={featured} />
              <div className="academy-feature__buy">
                <p className="academy-price">
                  <small>رسوم الدورة</small>
                  <strong>{price(featured)}</strong>
                </p>
                <Link className="public-primary" href={courseHref(featured)}>
                  تفاصيل الدورة
                </Link>
              </div>
            </article>
          )}

          {others.length ? (
            <section className="content-container" aria-labelledby="academy-others">
              <h2 className="cover-section__title" id="academy-others">
                دورات أخرى
              </h2>
              <ul className="academy-courses">
                {others.map((course) => (
                  <li className="academy-course" key={course.id}>
                    <Link
                      className="academy-course__cover"
                      href={courseHref(course)}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <CourseCover
                        title={course.title}
                        skill={course.skill}
                        lessons={course.lessonCount}
                      />
                    </Link>
                    <h3 className="academy-course__title">
                      <Link href={courseHref(course)}>{course.title}</Link>
                    </h3>
                    <p className="academy-course__text">{course.description}</p>
                    <Facts course={course} />
                    <div className="academy-course__buy">
                      <p className="academy-price">
                        <small>رسوم الدورة</small>
                        <strong>{price(course)}</strong>
                      </p>
                      <Link className="stage-link" href={courseHref(course)}>
                        تفاصيل الدورة
                        <span className="visually-hidden"> {course.title}</span>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="content-container academy-learn" aria-labelledby="academy-learn">
            <h2 className="cover-section__title" id="academy-learn">
              كيف تتعلّم
            </h2>
            <div className="academy-stairs">
              {/* The route climbs one step between stops; on phones it steps down. */}
              <svg
                className="academy-stairs__route academy-stairs__route--wide"
                viewBox="0 0 1200 200"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M1200 160H1040V96H640V32H400" vectorEffect="non-scaling-stroke" />
              </svg>
              <svg
                className="academy-stairs__route academy-stairs__route--phone"
                viewBox="0 0 350 400"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M339 11V132H307V308H275V363" />
              </svg>
              <ol className="academy-stairs__steps">
                {STEPS.map(([title, text]) => (
                  <li className="academy-step" key={title}>
                    <Diamond className="academy-step__stop" />
                    <h3 className="academy-step__title">{title}</h3>
                    <p className="academy-step__text">{text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
