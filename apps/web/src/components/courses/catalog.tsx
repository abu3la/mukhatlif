'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CourseSummary, CourseEnrollment } from '@mukhtalif/types';
import { useCustomer } from '../customer-provider';
import { CustomerGate } from '../customer-ui';
import { useCoursesApi } from './api';
import { BrandIcon } from '../brand-icon';
import './courses.css';

export function CourseCatalog({ mine = false }: { mine?: boolean }) {
  const { user } = useCustomer();
  return <CourseCatalogContent key={`${mine}:${user?.id ?? 'guest'}`} mine={mine} />;
}
function CourseCatalogContent({ mine }: { mine: boolean }) {
  const api = useCoursesApi();
  const { user } = useCustomer();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, CourseEnrollment>>({});
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    setCourses(null);
    setEnrollments({});
    setError('');
    if (mine && !user) return () => controller.abort();
    (async () => {
      if (mine) {
        const rows = await api<{ course: CourseSummary; enrollment: CourseEnrollment }[]>(
          '/app/courses',
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setCourses(rows.map((row) => row.course));
          setEnrollments(Object.fromEntries(rows.map((row) => [row.course.id, row.enrollment])));
        }
      } else {
        const rows = await api<CourseSummary[]>('/courses', undefined, controller.signal);
        if (!controller.signal.aborted) setCourses(rows);
      }
    })().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [api, mine, user, retry]);
  const filtered = courses?.filter((course) => {
    if (
      !`${course.title} ${course.description} ${course.instructor}`
        .toLocaleLowerCase('ar')
        .includes(search.trim().toLocaleLowerCase('ar'))
    )
      return false;
    if (
      Object.entries(filters).some(
        ([key, value]) =>
          value &&
          ['category', 'skill', 'level', 'instructor'].includes(key) &&
          course[key as keyof CourseSummary] !== value,
      )
    )
      return false;
    if (
      (filters.price === 'free' && course.price !== 0) ||
      (filters.price === 'paid' && course.price === 0)
    )
      return false;
    if (
      (filters.duration === 'short' && course.durationMinutes > 60) ||
      (filters.duration === 'long' && course.durationMinutes <= 60)
    )
      return false;
    return true;
  });
  const content = (
    <div className="page courses-page courses-catalog-page">
      <nav className="course-catalog-navigation" aria-label="تنقل أكاديمية مختلف">
        <Link href="/courses" aria-current={!mine ? 'page' : undefined}>
          <BrandIcon name="library" />
          أكاديمية مختلف
        </Link>
        <Link href="/library/courses" aria-current={mine ? 'page' : undefined}>
          <BrandIcon name="user" />
          دوراتي
        </Link>
      </nav>
      <header className="courses-heading">
        <h1>{mine ? 'دوراتي' : 'أكاديمية مختلف'}</h1>
        <p>
          {mine
            ? 'ارجع إلى آخر درس، وأكمل من حيث توقفت.'
            : 'دروس وتطبيقات تساعدك على تحويل المعرفة إلى ممارسة.'}
        </p>
      </header>
      <section className="courses-discovery" aria-label="البحث وتصفية الدورات">
        <label className="courses-search">
          ابحث عن دورة
          <span className="courses-search-field">
            <BrandIcon name="search" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم الدورة أو المدرّب"
            />
          </span>
        </label>
        <details className="courses-filter-panel">
          <summary>
            <BrandIcon name="filter" />
            تصفية النتائج
            {Object.values(filters).filter(Boolean).length > 0 && (
              <span>({Object.values(filters).filter(Boolean).length})</span>
            )}
            <BrandIcon name="down" />
          </summary>
          <div className="courses-filters">
            {(
              [
                ['category', 'المجال'],
                ['skill', 'المهارة'],
                ['level', 'المستوى'],
                ['instructor', 'المدرّب'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  value={filters[key] ?? ''}
                  onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                >
                  <option value="">الكل</option>
                  {[...new Set(courses?.map((c) => c[key]).filter(Boolean))].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              السعر
              <select
                value={filters.price ?? ''}
                onChange={(e) => setFilters({ ...filters, price: e.target.value })}
              >
                <option value="">الكل</option>
                <option value="free">مجانية</option>
                <option value="paid">مدفوعة</option>
              </select>
            </label>
            <label>
              المدة
              <select
                value={filters.duration ?? ''}
                onChange={(e) => setFilters({ ...filters, duration: e.target.value })}
              >
                <option value="">الكل</option>
                <option value="short">ساعة أو أقل</option>
                <option value="long">أكثر من ساعة</option>
              </select>
            </label>
          </div>
        </details>
        {(search || Object.values(filters).some(Boolean)) && (
          <button
            className="courses-reset"
            onClick={() => {
              setSearch('');
              setFilters({});
            }}
          >
            <BrandIcon name="close" />
            مسح البحث والفلاتر
          </button>
        )}
      </section>
      {courses && (
        <p className="courses-results" role="status">
          عدد النتائج: {filtered?.length ?? 0}
        </p>
      )}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="course-button" onClick={() => setRetry(retry + 1)}>
            حاول مجددًا
          </button>
        </div>
      ) : !courses ? (
        <p role="status">جار تحميل الدورات…</p>
      ) : !filtered?.length ? (
        <p>
          {courses.length
            ? 'لا توجد دورات تطابق بحثك.'
            : mine
              ? 'لم تسجّل في دورة بعد.'
              : 'لا توجد دورات منشورة بعد.'}
        </p>
      ) : (
        <div className="course-list">
          {filtered.map((course) => {
            const state = enrollments[course.id];
            const complete = Object.values(state?.progress ?? {}).filter((x) => x.complete).length;
            return (
              <article key={course.id} className="course-summary">
                <div className="course-card-cover">
                  <span className="course-card-skill">
                    {course.skill || course.category || 'أكاديمية مختلف'}
                  </span>
                  <h2>
                    <Link href={`/courses/${course.id}`}>{course.title}</Link>
                  </h2>

                  {course.hasTrailer && (
                    <Link className="course-card-preview" href={`/courses/${course.id}`}>
                      <BrandIcon name="play" /> شاهد تعريف الدورة
                    </Link>
                  )}
                </div>
                <div className="course-card-body">
                  <div className="course-card-category">
                    {course.category && (
                      <span>
                        <BrandIcon name="library" />
                        {course.category}
                      </span>
                    )}
                    {course.level && (
                      <span>
                        <BrandIcon name="level" />
                        {course.level}
                      </span>
                    )}
                  </div>
                  <p>{course.description}</p>
                  <div className="course-facts">
                    {course.instructor && (
                      <span>
                        <BrandIcon name="user" />
                        {course.instructor}
                      </span>
                    )}
                    <span>
                      <BrandIcon name="queue" />
                      {course.lessonCount} درس
                    </span>
                    {course.durationMinutes > 0 && (
                      <span>
                        <BrandIcon name="clock" />
                        {course.durationMinutes} دقيقة
                      </span>
                    )}
                  </div>
                </div>
                <div className="course-summary-action">
                  {state ? (
                    <>
                      <span>
                        {complete} من {course.lessonCount} درس مكتمل
                      </span>
                      <progress max={course.lessonCount || 1} value={complete} />
                      <Link className="course-button" href={`/courses/${course.id}`}>
                        أكمل التعلّم
                        <BrandIcon name="play" />
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="course-card-price">
                        <small>رسوم الدورة</small>
                        <strong>{course.price ? `${course.price} ر.س` : 'مجانية'}</strong>
                      </div>
                      <Link className="course-button" href={`/courses/${course.id}`}>
                        تفاصيل الدورة
                        <BrandIcon name="next" />
                      </Link>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
  return mine ? <CustomerGate>{content}</CustomerGate> : content;
}
