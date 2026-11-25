'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CourseEnrollment, CourseSummary } from '@mukhtalif/types';
import { BrandIcon } from '../brand-icon';
import { SkeletonFeature } from '../content-skeleton';
import { CourseCover } from '../course-cover';
import { useCustomer } from '../customer-provider';
import { CustomerGate } from '../customer-ui';
import { MINUTES_NOUN, countInWords, formatNumber } from '../formatting';
import { useCoursesApi } from './api';

type Enrolled = { course: CourseSummary; enrollment: CourseEnrollment };

const courseHref = (course: CourseSummary) => `/courses/${encodeURIComponent(course.id)}`;
const lessonsDone = ({ enrollment }: Enrolled) =>
  Object.values(enrollment.progress ?? {}).filter((lesson) => lesson.complete).length;
const shareDone = (row: Enrolled) =>
  Math.min(100, (lessonsDone(row) / Math.max(1, row.course.lessonCount)) * 100);

/** How far the learner got, along the foot of the course's cover. */
function Track({ row }: { row: Enrolled }) {
  return (
    <span className="my-course__track">
      <span className="my-course__done" style={{ width: `${shareDone(row)}%` }} />
    </span>
  );
}

function Done({ row, className }: { row: Enrolled; className?: string }) {
  return (
    <p className={'library-resume__where' + (className ? ` ${className}` : '')}>
      <bdi>{formatNumber(lessonsDone(row))}</bdi> من {formatNumber(row.course.lessonCount)} درس
      مكتمل
    </p>
  );
}

/** Who presents it, how long it is and its level; the lessons are in the line above. */
function Facts({ course }: { course: CourseSummary }) {
  if (!course.instructor && !(course.durationMinutes > 0) && !course.level) return null;
  return (
    <ul className="course-facts-line">
      {course.instructor ? (
        <li>
          <BrandIcon name="user" />
          تقديم {course.instructor}
        </li>
      ) : null}
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
 * «دوراتي» on the presentation site (D-24), a view of the library: the course
 * the learner has not finished crosses from the night stage with how many of
 * its lessons are done along its foot, and is introduced on the sheet with the
 * one action that continues it; the other courses follow three to a row. The
 * stage holds the crossing's place while the account and the courses load.
 */
export function MyCourses() {
  const { user } = useCustomer();
  return <MyCoursesContent key={user?.id ?? 'guest'} />;
}

function MyCoursesContent() {
  const api = useCoursesApi();
  const customer = useCustomer();
  const { user } = customer;
  const [rows, setRows] = useState<Enrolled[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError('');
    if (!user) return () => controller.abort();
    (async () => {
      const value = await api<Enrolled[]>('/app/courses', undefined, controller.signal);
      if (!controller.signal.aborted) setRows(value);
    })().catch((e) => {
      if (!controller.signal.aborted) {
        // A browser-level failure ("Failed to fetch") has no Arabic message of its own.
        const message = e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : '';
        setError(message || 'تعذّر تحميل الدورات. تحقّق من الاتصال ثم حاول مجددًا.');
      }
    });
    return () => controller.abort();
  }, [api, user, retry]);

  // The first course with lessons left, else the first one.
  const featured =
    rows?.find((row) => lessonsDone(row) < row.course.lessonCount) ?? rows?.[0] ?? null;
  const others = rows?.filter((row) => row !== featured) ?? [];
  const waiting = customer.loading || (Boolean(user) && !rows && !error);

  return (
    <div
      className={'stage-page library-page my-courses' + (featured || waiting ? ' has-cross' : '')}
    >
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby="my-courses-title">
          <div className="content-container stage-head">
            <p className="stage-head__crumbs">
              <Link href="/library">مكتبتي</Link>
            </p>
            <h1 id="my-courses-title" className="stage-head__title">
              دوراتي
            </h1>
            <p className="stage-head__lede">ارجع إلى آخر درس، وأكمل من حيث توقفت.</p>
          </div>
          {featured ? (
            <Link
              className="stage-cross library-resume__picture my-course__cross"
              href={courseHref(featured.course)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <CourseCover
                title={featured.course.title}
                skill={featured.course.skill}
                lessons={featured.course.lessonCount}
                large
              />
              <Track row={featured} />
            </Link>
          ) : waiting ? (
            <span className="skeleton stage-cross my-course__waiting" aria-hidden="true" />
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <CustomerGate bare>
            {error ? (
              <div className="content-container library-start my-courses__note" role="alert">
                <p className="library-note">{error}</p>
                <button
                  type="button"
                  className="public-primary"
                  onClick={() => setRetry(retry + 1)}
                >
                  حاول مجددًا
                </button>
              </div>
            ) : !rows ? (
              <>
                <span role="status" className="loading-announcement">
                  تحميل الدورات
                </span>
                <div aria-hidden="true">
                  <SkeletonFeature />
                </div>
              </>
            ) : !featured ? (
              <section
                className="content-container library-start my-courses__note"
                aria-labelledby="my-courses-none"
              >
                <h2 className="cover-section__title" id="my-courses-none">
                  لم تسجّل في دورة بعد
                </h2>
                <p className="library-note">بعد اكتمال الدفع تظهر الورشة في «دوراتي».</p>
                <Link className="public-primary" href="/courses">
                  أكاديمية مختلف
                </Link>
              </section>
            ) : (
              <>
                <article
                  className="content-container stage-feature my-course"
                  aria-labelledby="my-course-title"
                >
                  {featured.course.category || featured.course.skill ? (
                    <p className="stage-head__crumbs">
                      {featured.course.category ? <span>{featured.course.category}</span> : null}
                      {featured.course.skill ? (
                        <span className="stage-head__accent">{featured.course.skill}</span>
                      ) : null}
                    </p>
                  ) : null}
                  <h2 className="stage-feature__title" id="my-course-title">
                    <Link href={courseHref(featured.course)}>{featured.course.title}</Link>
                  </h2>
                  <Done row={featured} />
                  <Facts course={featured.course} />
                  <div className="stage-head__actions">
                    <Link className="public-primary" href={courseHref(featured.course)}>
                      أكمل التعلّم
                    </Link>
                  </div>
                </article>

                {others.length ? (
                  <section className="content-container" aria-labelledby="my-courses-others">
                    <h2 className="cover-section__title" id="my-courses-others">
                      دورات أخرى
                    </h2>
                    <ul className="academy-courses">
                      {others.map((row) => (
                        <li className="academy-course" key={row.course.id}>
                          <Link
                            className="academy-course__cover my-course__picture"
                            href={courseHref(row.course)}
                            tabIndex={-1}
                            aria-hidden="true"
                          >
                            <CourseCover
                              title={row.course.title}
                              skill={row.course.skill}
                              lessons={row.course.lessonCount}
                            />
                            <Track row={row} />
                          </Link>
                          <h3 className="academy-course__title my-course__title">
                            <Link href={courseHref(row.course)}>{row.course.title}</Link>
                          </h3>
                          <Done row={row} className="my-course__where" />
                          <div className="my-course__go">
                            <Link className="stage-link" href={courseHref(row.course)}>
                              أكمل التعلّم
                              <span className="visually-hidden"> {row.course.title}</span>
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <nav
                  className="content-container my-courses__more"
                  aria-label="تنقل أكاديمية مختلف"
                >
                  <Link className="stage-link" href="/courses">
                    أكاديمية مختلف
                  </Link>
                </nav>
              </>
            )}
          </CustomerGate>
        </div>
      </div>
    </div>
  );
}
