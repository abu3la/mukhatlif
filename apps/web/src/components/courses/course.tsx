'use client';

import { BusyButton } from '../busy-button';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  CourseDefinition,
  CourseEnrollment,
  CourseQuiz,
  CourseAssignment,
  CourseResource,
  CourseSummary,
  CourseWorkspace,
} from '@mukhtalif/types';
import { useCustomer } from '../customer-provider';
import { useCoursesApi, CourseApiError } from './api';
import { BrandIcon } from '../brand-icon';
import { CourseCover } from '../course-cover';
import { LESSONS_NOUN, MINUTES_NOUN, countInWords } from '../formatting';
import { Diamond } from '../maze-drawing';
import { CourseVideo } from './player';

const sectionIcons = {
  lesson: 'play',
  content: 'play',
  materials: 'library',
  files: 'library',
  quiz: 'check',
  assignment: 'document',
  certificate: 'certificate',
} as const;

type Detail = Omit<CourseDefinition, 'lessons' | 'resources'> & {
  lessons: { id: string; title: string; durationSeconds: number }[];
};
export function CoursePage({ courseId }: { courseId: string }) {
  const customer = useCustomer();
  // Remount private state on identity changes, including sign-out.
  return <CourseContent key={`${courseId}:${customer.user?.id ?? 'guest'}`} courseId={courseId} />;
}

/** A lesson's length in words, «دقيقة واحدة», «13 دقيقة»; nothing when unknown. */
const lessonMinutes = (seconds: number) =>
  seconds > 0 ? countInWords(Math.ceil(seconds / 60), MINUTES_NOUN) : '';

/** Instructor, lessons, length and level, spaced with bare icons (never dotted). */
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
 * A course of the presentation site (D-24). Before enrolling it stands on the
 * night stage like an article: where it belongs, its title and line, and its
 * cover, drawn from its lessons, crossing onto the sheet; there the trailer
 * and the overview come before the price and the one action, then the
 * syllabus. Once enrolled, the same stage carries the title and the sheet
 * holds the learning workspace.
 */
function CourseContent({ courseId }: { courseId: string }) {
  const api = useCoursesApi();
  const customer = useCustomer();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [workspace, setWorkspace] = useState<CourseWorkspace | null>(null);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState('lesson');
  const [lessonView, setLessonView] = useState('content');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState(false);
  // The simulated outcome being sent, so only its own button shows the loader.
  const [outcome, setOutcome] = useState<'success' | 'declined' | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    (async () => {
      const course = await api<Detail>(`/courses/${courseId}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setDetail(course);
      if (customer.user) {
        try {
          const result = await api<CourseWorkspace>(
            `/app/courses/${courseId}`,
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setWorkspace(result);
            setSelected(result.enrollment.lastLesson || result.course.lessons[0]?.id || '');
          }
        } catch (e) {
          if (!(e instanceof CourseApiError && e.status === 403)) throw e;
        }
      }
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, courseId, customer.user, retry]);
  const save = (enrollment: CourseEnrollment) =>
    setWorkspace((old) => (old ? { ...old, enrollment } : old));
  const act = async (action: string, body: unknown, message?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<CourseEnrollment>(`/app/courses/${courseId}/${action}`, body);
      save(result);
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const enroll = async (choice: 'success' | 'declined') => {
    setOutcome(choice);
    if (await act('checkout', { mode: 'simulation', outcome: choice })) {
      setCheckout(false);
      setRetry(retry + 1);
      setNotice('اكتمل التسجيل التجريبي. لم يُخصم أي مبلغ.');
    }
  };
  const lesson = workspace?.course.lessons.find((item) => item.id === selected);
  const course = workspace?.course;
  const isLessonLocked = (index: number) =>
    !!course?.lessons
      .slice(0, index)
      .some((item) => !workspace?.enrollment.progress[item.id]?.complete);
  const completedLessons =
    course?.lessons.filter((item) => workspace?.enrollment.progress[item.id]?.complete).length ?? 0;
  const lessonIndex = course?.lessons.findIndex((item) => item.id === selected) ?? -1;
  const [reading, setReading] = useState<Record<string, number>>({});
  const openLesson = (id: string) => {
    setSelected(id);
    setView('lesson');
    setLessonView('content');
  };
  const certificateReady =
    !!course &&
    !!workspace &&
    course.lessons.every((item) => workspace.enrollment.progress[item.id]?.complete) &&
    [course, ...course.lessons].every(
      (item) =>
        (!item.quiz || workspace.enrollment.quizzes[item.quiz.id]?.passed) &&
        (!item.assignment?.required ||
          workspace.enrollment.assignments[item.assignment.id]?.status === 'Pass'),
    );

  const certificateLocked = !workspace?.enrollment.certificate && !certificateReady;

  const percentFor = (item: CourseDefinition['lessons'][number]) => {
    const progress = workspace?.enrollment.progress[item.id];
    return progress?.complete
      ? 100
      : item.video
        ? Math.min(
            100,
            Math.round(((progress?.watched ?? 0) / Math.max(1, item.durationSeconds)) * 100),
          )
        : Math.max(reading[item.id] ?? 0, progress?.readPercent ?? 0);
  };
  const messages = (
    <>
      {error && (
        <p role="alert" className="course-message course-message--error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="course-message">
          {notice}
        </p>
      )}
    </>
  );
  const crossing = !!detail && !workspace && !loading;
  return (
    <div
      className={
        'stage-page course-page' +
        (crossing ? ' has-cross' : '') +
        (workspace ? ' course-page--learning' : '')
      }
    >
      <div className="stage-scope">
        <section className="stage-intro" aria-labelledby={detail ? 'course-title' : undefined}>
          <div className="content-container stage-head">
            <p className="stage-head__crumbs">
              <Link href="/courses">أكاديمية مختلف</Link>
              {detail?.category ? <span>{detail.category}</span> : null}
              {detail?.skill ? <span className="stage-head__accent">{detail.skill}</span> : null}
            </p>
            {detail ? (
              <>
                <h1 id="course-title" className="stage-head__title">
                  {detail.title}
                </h1>
                {workspace ? (
                  <Facts course={detail} />
                ) : detail.description ? (
                  <p className="stage-head__lede">{detail.description}</p>
                ) : null}
              </>
            ) : null}
          </div>
          {crossing && detail ? (
            // The cover is drawn from what the course is; the title above names it.
            <div className="stage-cross academy-cross" aria-hidden="true">
              <CourseCover
                title={detail.title}
                skill={detail.skill}
                lessons={detail.lessons.map((item) => item.title)}
                large
              />
            </div>
          ) : null}
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          {loading ? (
            <p className="content-container course-state" role="status">
              جار تحميل الدورة…
            </p>
          ) : !detail ? (
            <div className="content-container course-state">
              <p role="alert">{error || 'الدورة غير موجودة.'}</p>
              <button className="public-primary" onClick={() => setRetry(retry + 1)}>
                حاول مجددًا
              </button>
            </div>
          ) : !workspace ? (
            <>
              {detail.hasTrailer && <CourseTrailer courseId={courseId} />}
              <div className="content-container course-read">
                {/* A course with nothing written about it skips straight to its offer. */}
                {(detail.overview ||
                  detail.description ||
                  detail.overviewHtml ||
                  detail.descriptionHtml ||
                  detail.audience) && (
                  <section aria-labelledby="course-about">
                    <h2 className="cover-section__title" id="course-about">
                      عن الدورة
                    </h2>
                    {(detail.overview ||
                      detail.description ||
                      detail.overviewHtml ||
                      detail.descriptionHtml) && (
                      <CourseProse
                        text={detail.overview || detail.description}
                        html={detail.overviewHtml || detail.descriptionHtml}
                      />
                    )}
                    {detail.audience && (
                      <>
                        <h3 className="course-read__subtitle">لمن هذه الدورة؟</h3>
                        <p className="course-text">{detail.audience}</p>
                      </>
                    )}
                  </section>
                )}
                <div className="course-buy">
                  <Facts course={detail} />
                  <div className="course-buy__row">
                    <h2 className="academy-price">
                      <small>رسوم الدورة</small>
                      <strong>{detail.price ? `${detail.price} ر.س` : 'مجانية'}</strong>
                    </h2>
                    {!checkout && (
                      <button
                        className="public-primary"
                        onClick={() => {
                          if (customer.requireAccount()) setCheckout(true);
                        }}
                      >
                        المتابعة للتسجيل
                      </button>
                    )}
                  </div>
                  <p className="course-buy__note">
                    التسجيل حاليًا بمحاكاة دفع. لن نطلب بطاقة ولن نخصم أي مبلغ.
                  </p>
                  {checkout && (
                    <section className="course-buy__checkout" aria-labelledby="course-simulation">
                      <h3 id="course-simulation">محاكاة الدفع</h3>
                      <p>اختر نتيجة العملية لتجربة التسجيل.</p>
                      <div className="course-buy__actions">
                        <BusyButton
                          aria-busy={busy && outcome === 'success'}
                          className="public-primary"
                          disabled={busy}
                          onClick={() => enroll('success')}
                        >
                          محاكاة دفع ناجح والتسجيل
                        </BusyButton>
                        <BusyButton
                          aria-busy={busy && outcome === 'declined'}
                          className="course-text-action"
                          disabled={busy}
                          onClick={() => enroll('declined')}
                        >
                          محاكاة رفض الدفع
                        </BusyButton>
                        <button
                          className="course-text-action"
                          disabled={busy}
                          onClick={() => setCheckout(false)}
                        >
                          إلغاء
                        </button>
                      </div>
                    </section>
                  )}
                  {messages}
                </div>
              </div>

              <section className="content-container course-read" aria-labelledby="course-syllabus">
                <h2 className="cover-section__title" id="course-syllabus">
                  محتوى الدورة
                </h2>
                {/* One stop per lesson, as on the cover; the last is the full stop. */}
                <ol className="course-syllabus">
                  {detail.lessons.map((item) => (
                    <li key={item.id} className="course-syllabus__lesson">
                      <Diamond className="course-syllabus__stop" />
                      <span className="course-syllabus__title">{item.title}</span>
                      {item.durationSeconds > 0 && (
                        <span className="course-syllabus__time">
                          <BrandIcon name="clock" />
                          {lessonMinutes(item.durationSeconds)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          ) : (
            <div className="content-container learn">
              {messages}
              {(view !== 'lesson' ||
                course!.resources.length > 0 ||
                course!.quiz ||
                course!.assignment) && (
                <nav className="learn-tabs" aria-label="أقسام الدورة">
                  {[
                    ['lesson', 'التعلّم'],
                    ...(course!.resources.length ? [['materials', 'ملفات الدورة']] : []),
                    ...(course!.quiz ? [['quiz', 'اختبار الدورة']] : []),
                    ...(course!.assignment ? [['assignment', 'ورقة عمل الدورة']] : []),
                  ].map(([id, label]) => {
                    const locked =
                      ['quiz', 'assignment'].includes(id) &&
                      course!.lessons.some(
                        (item) => !workspace.enrollment.progress[item.id]?.complete,
                      );
                    return (
                      <button
                        key={id}
                        disabled={locked}
                        aria-current={view === id ? 'page' : undefined}
                        onClick={() => setView(id)}
                      >
                        <BrandIcon
                          name={locked ? 'lock' : sectionIcons[id as keyof typeof sectionIcons]}
                        />
                        {label}
                      </button>
                    );
                  })}
                </nav>
              )}
              {view === 'lesson' && (
                <div className="learn-grid">
                  <aside className="learn-side">
                    <div className="learn-index">
                      <div className="learn-index__summary">
                        <h2>محتوى الدورة</h2>
                        <span>
                          {completedLessons}/{course!.lessons.length} مكتمل
                        </span>
                        <progress
                          value={completedLessons}
                          max={course!.lessons.length || 1}
                          aria-label="الدروس المكتملة"
                        />
                      </div>
                      <ol className="learn-index__list">
                        {course!.lessons.map((item, index) => (
                          <li key={item.id}>
                            <button
                              className="learn-step"
                              disabled={isLessonLocked(index)}
                              title={isLessonLocked(index) ? 'أكمل الدرس السابق أولًا' : undefined}
                              aria-current={item.id === selected ? 'step' : undefined}
                              onClick={() => openLesson(item.id)}
                            >
                              <span className="learn-step__name">
                                <LessonRing
                                  value={percentFor(item)}
                                  complete={!!workspace.enrollment.progress[item.id]?.complete}
                                />
                                <span>
                                  {index + 1}. {item.title}
                                </span>
                              </span>
                              <span className="learn-step__meta">
                                <span>
                                  <BrandIcon name={item.video ? 'play' : 'document'} />
                                  {item.video ? 'فيديو' : 'قراءة'}
                                </span>
                                {item.id === selected ? (
                                  <small>الدرس الحالي</small>
                                ) : isLessonLocked(index) ? (
                                  <small>بعد الدرس السابق</small>
                                ) : item.video && item.durationSeconds > 0 ? (
                                  <small>{lessonMinutes(item.durationSeconds)}</small>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                      <label className="learn-picker">
                        انتقل إلى درس
                        <select
                          value={selected}
                          onChange={(event) => openLesson(event.target.value)}
                        >
                          {course!.lessons.map((item, index) => (
                            <option key={item.id} value={item.id} disabled={isLessonLocked(index)}>
                              {index + 1}. {item.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <details className="learn-cert" data-locked={certificateLocked || undefined}>
                      <summary className="learn-cert__entry">
                        <BrandIcon name={certificateLocked ? 'lock' : 'certificate'} />
                        <span>
                          <strong>{certificateLocked ? 'الشهادة مقفلة' : 'شهادة الإكمال'}</strong>
                          <small>
                            {workspace.enrollment.certificate
                              ? 'شهادتك جاهزة للعرض'
                              : certificateReady
                                ? 'أكملت المتطلبات'
                                : 'عرض متطلبات الشهادة'}
                          </small>
                        </span>
                        <BrandIcon name="down" className="learn-cert__toggle" />
                      </summary>
                      <div className="learn-cert__details">
                        {workspace.enrollment.certificate ? (
                          <button className="public-primary" onClick={() => setView('certificate')}>
                            <BrandIcon name="certificate" />
                            عرض الشهادة
                          </button>
                        ) : (
                          <>
                            <ul className="learn-cert__list" aria-label="متطلبات الشهادة">
                              <li>
                                <BrandIcon
                                  name={
                                    completedLessons === course!.lessons.length ? 'check' : 'play'
                                  }
                                />
                                <span>
                                  إكمال الدروس
                                  <small>
                                    {completedLessons}/{course!.lessons.length} مكتمل
                                  </small>
                                </span>
                              </li>
                              {[course!, ...course!.lessons].flatMap((item) => [
                                ...(item.quiz
                                  ? [
                                      <li key={`quiz-${item.quiz.id}`}>
                                        <BrandIcon
                                          name={
                                            workspace.enrollment.quizzes[item.quiz.id]?.passed
                                              ? 'check'
                                              : 'document'
                                          }
                                        />
                                        <span>
                                          {item.quiz.title}
                                          <small>
                                            {workspace.enrollment.quizzes[item.quiz.id]?.passed
                                              ? 'تم الاجتياز'
                                              : 'اجتياز الاختبار مطلوب'}
                                          </small>
                                        </span>
                                      </li>,
                                    ]
                                  : []),
                                ...(item.assignment?.required
                                  ? [
                                      <li key={`assignment-${item.assignment.id}`}>
                                        <BrandIcon
                                          name={
                                            workspace.enrollment.assignments[item.assignment.id]
                                              ?.status === 'Pass'
                                              ? 'check'
                                              : 'document'
                                          }
                                        />
                                        <span>
                                          {item.assignment.title}
                                          <small>
                                            {workspace.enrollment.assignments[item.assignment.id]
                                              ?.status === 'Pass'
                                              ? 'تم الاعتماد'
                                              : 'اعتماد ورقة العمل مطلوب'}
                                          </small>
                                        </span>
                                      </li>,
                                    ]
                                  : []),
                              ])}
                            </ul>
                            {certificateReady && (
                              <BusyButton
                                loadingMode="replace"
                                aria-busy={busy}
                                className="public-primary"
                                disabled={busy}
                                onClick={() => act('certificate', {}, 'صدرت شهادة الإكمال.')}
                              >
                                <BrandIcon name="certificate" />
                                إصدار الشهادة
                              </BusyButton>
                            )}
                          </>
                        )}
                      </div>
                    </details>
                  </aside>
                  <section className="learn-pane" key={selected}>
                    {lesson && (
                      <>
                        <div className="learn-pane__head">
                          <div className="learn-pane__title">
                            <h2>{lesson.title}</h2>
                            {workspace.enrollment.progress[lesson.id]?.complete && (
                              <CompletionChip />
                            )}
                          </div>
                          <span className="learn-pane__index" dir="ltr">
                            {lessonIndex + 1}/{course!.lessons.length}
                          </span>
                        </div>
                        {(lesson.resources.length > 0 || lesson.quiz || lesson.assignment) && (
                          <nav className="learn-tabs learn-tabs--lesson" aria-label="أقسام الدرس">
                            {[
                              ['content', 'الدرس'],
                              ...(lesson.resources.length ? [['files', 'ملفات الدرس']] : []),
                              ...(lesson.quiz ? [['quiz', 'اختبار الدرس']] : []),
                              ...(lesson.assignment ? [['assignment', 'ورقة العمل']] : []),
                            ].map(([id, label]) => {
                              const locked =
                                ['quiz', 'assignment'].includes(id) &&
                                !workspace.enrollment.progress[lesson.id]?.complete;
                              return (
                                <button
                                  key={id}
                                  disabled={locked}
                                  aria-current={lessonView === id ? 'page' : undefined}
                                  onClick={() => setLessonView(id)}
                                >
                                  <BrandIcon
                                    name={
                                      locked
                                        ? 'lock'
                                        : sectionIcons[id as keyof typeof sectionIcons]
                                    }
                                  />
                                  {label}
                                </button>
                              );
                            })}
                          </nav>
                        )}
                        <div
                          className="learn-pane__body"
                          key={lessonView}
                          tabIndex={0}
                          aria-label="محتوى الدرس"
                        >
                          {lessonView === 'content' && (
                            <>
                              {lesson.video && (
                                <CourseVideo
                                  courseId={courseId}
                                  lesson={lesson}
                                  initialPosition={
                                    workspace.enrollment.progress[lesson.id]?.position ?? 0
                                  }
                                  bookmarks={workspace.enrollment.bookmarks}
                                  onSaved={save}
                                />
                              )}
                              {lesson.video ? (
                                <CourseProse text={lesson.body} html={lesson.bodyHtml} />
                              ) : (
                                <LessonReading
                                  courseId={courseId}
                                  lessonId={lesson.id}
                                  body={lesson.body}
                                  html={lesson.bodyHtml}
                                  initialPercent={
                                    workspace.enrollment.progress[lesson.id]?.readPercent ?? 0
                                  }
                                  complete={!!workspace.enrollment.progress[lesson.id]?.complete}
                                  onProgress={(percent) =>
                                    setReading((old) => ({ ...old, [lesson.id]: percent }))
                                  }
                                  onSaved={save}
                                />
                              )}
                            </>
                          )}
                          {lessonView === 'files' && (
                            <Resources courseId={courseId} resources={lesson.resources} />
                          )}
                          {lessonView === 'quiz' && (
                            <Assessment
                              courseId={courseId}
                              source={{ quiz: lesson.quiz }}
                              enrollment={workspace.enrollment}
                              onSaved={save}
                            />
                          )}
                          {lessonView === 'assignment' && (
                            <Assessment
                              courseId={courseId}
                              source={{ assignment: lesson.assignment }}
                              enrollment={workspace.enrollment}
                              onSaved={save}
                            />
                          )}
                        </div>
                        <nav className="learn-pane__steps" aria-label="التنقل بين الدروس">
                          <button
                            className="course-text-action"
                            disabled={lessonIndex <= 0}
                            onClick={() => openLesson(course!.lessons[lessonIndex - 1].id)}
                          >
                            <BrandIcon name="previous" />
                            الدرس السابق
                          </button>
                          <span dir="ltr">
                            {lessonIndex + 1} / {course!.lessons.length}
                          </span>
                          <button
                            className="public-primary"
                            disabled={
                              lessonIndex >= course!.lessons.length - 1 ||
                              isLessonLocked(lessonIndex + 1)
                            }
                            onClick={() => openLesson(course!.lessons[lessonIndex + 1].id)}
                          >
                            الدرس التالي
                            <BrandIcon name="next" />
                          </button>
                        </nav>
                      </>
                    )}
                  </section>
                </div>
              )}
              {view === 'materials' && (
                <section className="learn-panel" aria-labelledby="course-files">
                  <h2 id="course-files">ملفات الدورة</h2>
                  <Resources courseId={courseId} resources={course!.resources} />
                  {!course!.resources.length && <p>لا توجد ملفات إضافية لهذه الدورة.</p>}
                </section>
              )}
              {view === 'quiz' && (
                <div className="learn-panel">
                  <Assessment
                    courseId={courseId}
                    source={{ quiz: course!.quiz }}
                    enrollment={workspace.enrollment}
                    onSaved={save}
                  />
                </div>
              )}
              {view === 'assignment' && (
                <div className="learn-panel">
                  <Assessment
                    courseId={courseId}
                    source={{ assignment: course!.assignment }}
                    enrollment={workspace.enrollment}
                    onSaved={save}
                  />
                </div>
              )}
              {view === 'certificate' && (
                <section className="learn-panel learn-completion">
                  <header className="learn-completion__head">
                    <BrandIcon name={certificateLocked ? 'lock' : 'certificate'} />
                    <div>
                      <div className="learn-completion__title">
                        <h2>{certificateLocked ? 'الشهادة مقفلة' : 'شهادة الإكمال'}</h2>
                        {(certificateReady || workspace.enrollment.certificate) && (
                          <CompletionChip />
                        )}
                      </div>
                      <p>
                        {workspace.enrollment.certificate
                          ? 'أتممت متطلبات الدورة. شهادتك جاهزة للحفظ والمشاركة.'
                          : certificateReady
                            ? 'أكملت جميع المتطلبات. يمكنك إصدار شهادتك الآن.'
                            : 'تُفتح الشهادة بعد إكمال جميع المتطلبات التالية.'}
                      </p>
                    </div>
                  </header>
                  {workspace.enrollment.certificate ? (
                    <>
                      <div className="learn-certificate">
                        <img
                          src="/handoff/mukhtalif-logo.svg"
                          alt="مختلف"
                          width="160"
                          height="54"
                        />
                        <h2>شهادة إكمال</h2>
                        <p>تشهد مختلف بأن</p>
                        <h3>{workspace.enrollment.certificate.member}</h3>
                        <p>أكمل دورة «{course!.title}» ومتطلباتها.</p>
                        <p>
                          {new Date(workspace.enrollment.certificate.issuedAt).toLocaleDateString(
                            'ar-SA',
                            { year: 'numeric', month: 'long', day: 'numeric' },
                          )}
                        </p>
                        <small>رقم الشهادة: {workspace.enrollment.certificate.id}</small>
                      </div>
                      <button className="public-primary" onClick={() => window.print()}>
                        <BrandIcon name="document" />
                        طباعة الشهادة أو حفظها PDF
                      </button>
                    </>
                  ) : (
                    <BusyButton
                      aria-busy={Boolean(busy)}
                      className="public-primary"
                      disabled={busy || !certificateReady}
                      onClick={() => act('certificate', {}, 'صدرت شهادة الإكمال.')}
                    >
                      <BrandIcon name={certificateLocked ? 'lock' : 'certificate'} />
                      {certificateLocked ? 'الشهادة مقفلة' : 'إصدار الشهادة'}
                    </BusyButton>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Resources({ courseId, resources }: { courseId: string; resources: CourseResource[] }) {
  const api = useCoursesApi();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const download = async (resource: CourseResource) => {
    setBusy(resource.id);
    setError('');
    try {
      const result = await api<{ url: string }>(`/app/courses/${courseId}/asset`, {
        file: resource.file,
      });
      const link = document.createElement('a');
      link.href = result.url;
      link.rel = 'noreferrer';
      link.download = resource.title;
      link.click();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      {resources.length > 0 && (
        <ul className="learn-files">
          {resources.map((resource) => (
            <li key={resource.id}>
              <BusyButton
                className="learn-file"
                aria-busy={busy === resource.id}
                disabled={Boolean(busy)}
                onClick={() => download(resource)}
              >
                {busy === resource.id ? (
                  'جار تجهيز الملف…'
                ) : (
                  <>
                    <BrandIcon name="document" />
                    {`تنزيل ${resource.title}`}
                  </>
                )}
              </BusyButton>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="course-message course-message--error">
          {error}
        </p>
      )}
    </>
  );
}
function Assessment({
  courseId,
  source,
  enrollment,
  onSaved,
}: {
  courseId: string;
  source: { quiz?: CourseQuiz; assignment?: CourseAssignment };
  enrollment: CourseEnrollment;
  onSaved: (state: CourseEnrollment) => void;
}) {
  return (
    <>
      {source.quiz && (
        <Quiz
          key={source.quiz.id}
          courseId={courseId}
          quiz={source.quiz}
          state={enrollment.quizzes[source.quiz.id]}
          onSaved={onSaved}
        />
      )}
      {source.assignment && (
        <Assignment
          key={source.assignment.id}
          courseId={courseId}
          assignment={source.assignment}
          state={enrollment.assignments[source.assignment.id]}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
function Quiz({
  courseId,
  quiz,
  state,
  onSaved,
}: {
  courseId: string;
  quiz: CourseQuiz;
  state?: CourseEnrollment['quizzes'][string];
  onSaved: (state: CourseEnrollment) => void;
}) {
  const api = useCoursesApi();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="learn-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onSaved(
            await api<CourseEnrollment>(`/app/courses/${courseId}/quiz`, {
              quizId: quiz.id,
              answers,
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{quiz.title}</h3>
      <p className="learn-form__note">
        درجة الاجتياز: {quiz.passPercent}٪ <br />
        المحاولات المتبقية: {quiz.maxAttempts - (state?.attempts ?? 0)}
      </p>
      {quiz.questions.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.prompt}</legend>
          {q.options.map((option, index) => (
            <label key={index}>
              <input
                required
                type="radio"
                name={q.id}
                checked={answers[q.id] === index}
                onChange={() => setAnswers({ ...answers, [q.id]: index })}
              />
              {option}
            </label>
          ))}
        </fieldset>
      ))}
      {state && (
        <p role="status" className="course-message">
          {state.passed ? 'اجتزت الاختبار.' : 'لم تجتز الاختبار بعد.'} نتيجة آخر محاولة:{' '}
          {Math.round(state.percentage)}٪
        </p>
      )}
      {error && (
        <p role="alert" className="course-message course-message--error">
          {error}
        </p>
      )}
      <BusyButton
        aria-busy={Boolean(busy)}
        className="public-primary"
        disabled={busy || (state?.attempts ?? 0) >= quiz.maxAttempts}
      >
        <BrandIcon name="check" />
        {busy ? 'جار التصحيح…' : 'إرسال الإجابات'}
      </BusyButton>
    </form>
  );
}
function Assignment({
  courseId,
  assignment,
  state,
  onSaved,
}: {
  courseId: string;
  assignment: CourseAssignment;
  state?: CourseEnrollment['assignments'][string];
  onSaved: (state: CourseEnrollment) => void;
}) {
  const api = useCoursesApi();
  const [answer, setAnswer] = useState(state?.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const statuses: Record<string, string> = {
    Pass: 'مجتازة',
    Fail: 'تحتاج إلى تعديل',
    'Not Graded': 'بانتظار التقييم',
  };
  return (
    <form
      className="learn-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onSaved(
            await api<CourseEnrollment>(`/app/courses/${courseId}/assignment`, {
              assignmentId: assignment.id,
              answer,
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{assignment.title}</h3>
      <p className="learn-form__note">
        {assignment.required ? 'مطلوبة لإصدار الشهادة' : 'تطبيق اختياري'}
      </p>
      <p className="course-text">{assignment.instructions}</p>
      {assignment.file && (
        <Resources
          courseId={courseId}
          resources={[{ id: assignment.id, title: 'ورقة العمل', file: assignment.file }]}
        />
      )}
      <label className="learn-form__field">
        إجابتك
        <textarea
          required
          maxLength={20000}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={6}
          disabled={state?.status === 'Pass'}
        />
      </label>
      {state && (
        <p role="status" className="course-message">
          {statuses[state.status] ?? state.status}
          {state.comments && `: ${state.comments}`}
        </p>
      )}
      {error && (
        <p role="alert" className="course-message course-message--error">
          {error}
        </p>
      )}
      <BusyButton
        aria-busy={Boolean(busy)}
        className="public-primary"
        disabled={busy || state?.status === 'Pass'}
      >
        <BrandIcon name="document" />
        {busy ? 'جار الإرسال…' : state ? 'إعادة إرسال الحل' : 'إرسال الحل للتقييم'}
      </BusyButton>
    </form>
  );
}

function CompletionChip() {
  return (
    <span className="learn-chip">
      <BrandIcon name="check" />
      مكتمل
    </span>
  );
}
/** Per-lesson progress: a ring with the percent, or one check once complete. */
function LessonRing({ value, complete = false }: { value: number; complete?: boolean }) {
  const percent = complete ? 100 : Math.max(0, Math.min(99, Math.round(value)));
  return (
    <svg
      className={`learn-ring ${complete ? 'is-complete' : ''}`}
      viewBox="0 0 36 36"
      role="img"
      aria-label={complete ? 'الدرس مكتمل' : `تقدم الدرس ${percent}٪`}
    >
      <circle className="learn-ring__track" cx="18" cy="18" r="15" />
      {/* A zero-length arc would still draw its round cap as a dot. */}
      {percent > 0 && (
        <circle
          className="learn-ring__fill"
          cx="18"
          cy="18"
          r="15"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
          transform="rotate(-90 18 18)"
        />
      )}
      {complete ? (
        <path
          d="m11 18 5 5 9-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <text x="18" y="18" textAnchor="middle" dominantBaseline="central">
          {percent}
        </text>
      )}
    </svg>
  );
}

function LessonReading({
  courseId,
  lessonId,
  body,
  html,
  initialPercent,
  complete,
  onProgress,
  onSaved,
}: {
  courseId: string;
  lessonId: string;
  body: string;
  html?: string;
  initialPercent: number;
  complete: boolean;
  onProgress: (percent: number) => void;
  onSaved: (state: CourseEnrollment) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onProgress, onSaved });
  callbacks.current = { onProgress, onSaved };
  const api = useCoursesApi();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const node = element.current;
    const pane = node?.parentElement;
    if (!node || !pane || complete) return;
    let best = initialPercent;
    let sent = initialPercent;
    let active = true;
    let visible = false;
    let timer: ReturnType<typeof setTimeout>;
    let chain = Promise.resolve();
    const saveProgress = () => {
      if (best <= sent) return;
      const value = best;
      sent = value;
      chain = chain
        .then(async () => {
          const state = await api<CourseEnrollment>(`/app/courses/${courseId}/progress`, {
            lessonId,
            position: 0,
            readPercent: value,
          });
          if (active) {
            callbacks.current.onSaved(state);
            setError('');
          }
        })
        .catch((e) => {
          sent = initialPercent;
          if (active) setError(e.message);
        });
    };
    const measure = () => {
      if (!visible || document.visibilityState !== 'visible') return;
      const percent = Math.min(
        100,
        Math.floor(((pane.scrollTop + pane.clientHeight) / Math.max(1, pane.scrollHeight)) * 100),
      );
      best = Math.max(best, percent);
      callbacks.current.onProgress(best);
      clearTimeout(timer);
      timer = setTimeout(saveProgress, 500);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          clearTimeout(timer);
          timer = setTimeout(measure, 1800);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(pane);
    pane.addEventListener('scroll', measure, { passive: true });
    document.addEventListener('visibilitychange', measure);
    return () => {
      active = false;
      clearTimeout(timer);
      observer.disconnect();
      pane.removeEventListener('scroll', measure);
      document.removeEventListener('visibilitychange', measure);
      saveProgress();
    };
  }, [api, courseId, lessonId, initialPercent, complete, retry]);
  return (
    <div ref={element}>
      <CourseProse text={body} html={html} />
      <p className="learn-reading-status" role="status">
        {complete ? 'اكتملت القراءة' : 'يُحفظ تقدم القراءة تلقائيًا عند التمرير.'}
      </p>
      {error && (
        <div role="alert" className="course-alert">
          <p className="course-message course-message--error">{error}</p>
          <button className="public-primary" onClick={() => setRetry(retry + 1)}>
            أعد حفظ التقدم
          </button>
        </div>
      )}
    </div>
  );
}

function CourseTrailer({ courseId }: { courseId: string }) {
  const api = useCoursesApi();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<{ url: string }>(`/courses/${courseId}/trailer`, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setUrl(result.url);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [api, courseId, retry]);
  return (
    <section
      className="content-container course-read course-trailer-view"
      aria-label="المقطع التعريفي"
    >
      <h2 className="cover-section__title">شاهد مقدمة الدورة</h2>
      {url && !error ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label="المقطع التعريفي للدورة"
          onError={() => setError('تعذّر تشغيل المقطع التعريفي.')}
        />
      ) : (
        !error && (
          <p className="course-trailer-view__wait" role="status">
            جار تحميل المقطع التعريفي…
          </p>
        )
      )}
      {error && (
        <div role="alert" className="course-alert">
          <p className="course-message course-message--error">{error}</p>
          <button className="public-primary" onClick={() => setRetry(retry + 1)}>
            حاول مجددًا
          </button>
        </div>
      )}
    </section>
  );
}

/** HTML is generated by the shared API's allowlisted blog renderer. */
function CourseProse({ text, html }: { text: string; html?: string }) {
  return html ? (
    <div className="course-text course-text--rich" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className="course-text">{text}</div>
  );
}
