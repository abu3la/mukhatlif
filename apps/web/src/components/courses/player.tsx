'use client';
import { useEffect, useRef, useState } from 'react';
import type { CourseEnrollment, CourseLesson } from '@mukhtalif/types';
import { BusyButton } from '../busy-button';
import { BrandIcon } from '../brand-icon';
import { useCoursesApi } from './api';

export function CourseVideo({
  courseId,
  lesson,
  initialPosition,
  onSaved,
  bookmarks,
}: {
  bookmarks?: CourseEnrollment['bookmarks'];
  courseId: string;
  lesson: CourseLesson;
  initialPosition: number;
  onSaved: (state: CourseEnrollment) => void;
}) {
  const api = useCoursesApi();
  const video = useRef<HTMLVideoElement>(null);
  const initial = useRef(initialPosition);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{id: string; position: number; note: string} | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [bookmarkError, setBookmarkError] = useState('');
  const marks = Object.entries(bookmarks ?? {}).filter(([, mark]) => mark.lessonId === lesson.id).sort((a, b) => a[1].position - b[1].position);
  const timestamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const writeBookmark = async (remove = false) => {
    if (!draft || bookmarkBusy) return;
    setBookmarkBusy(true);
    setBookmarkError('');
    try {
      const state = await api<CourseEnrollment>(`/app/courses/${courseId}/bookmark`, { ...draft, lessonId: lesson.id, remove });
      saved.current(state);
      setDraft(null);
    } catch (e) { setBookmarkError((e as Error).message); }
    finally { setBookmarkBusy(false); }
  };
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setUrl('');
    setError('');
    api<{ url: string }>(
      `/app/courses/${courseId}/asset`,
      { file: lesson.video },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setUrl(result.url);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [api, courseId, lesson.video, retry]);
  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    let start = element.currentTime,
      previous = start,
      lastAt = performance.now(),
      lastSent = lastAt;
    let active = true;
    let chain = Promise.resolve();
    const send = (range = true) => {
      const position = Math.min(element.currentTime, lesson.durationSeconds);
      const body = {
        lessonId: lesson.id,
        position,
        ...(range && previous > start
          ? { start, end: Math.min(previous, lesson.durationSeconds) }
          : {}),
      };
      start = previous = position;
      lastSent = performance.now();
      chain = chain
        .then(async () => {
          const state = await api<CourseEnrollment>(`/app/courses/${courseId}/progress`, body);
          if (active) {
            saved.current(state);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(`${e.message} قد لا يُحفظ آخر موضع.`);
        });
    };
    const metadata = () => {
      element.currentTime = Math.min(initial.current, element.duration || 0);
      start = previous = element.currentTime;
      send(false);
    };
    const tick = () => {
      const now = performance.now();
      const current = element.currentTime;
      const elapsed = (now - lastAt) / 1000;
      if (element.seeking || current < previous || current - previous > elapsed * 2.2 + 0.6)
        start = current;
      previous = current;
      lastAt = now;
      if (now - lastSent >= 10000) send();
    };
    const seek = () => {
      send();
      start = previous = element.currentTime;
      lastAt = performance.now();
    };
    const pause = () => send();
    const visibility = () => {
      if (document.visibilityState === 'hidden') send();
    };
    element.addEventListener('loadedmetadata', metadata);
    element.addEventListener('timeupdate', tick);
    element.addEventListener('seeking', seek);
    element.addEventListener('pause', pause);
    element.addEventListener('ended', pause);
    document.addEventListener('visibilitychange', visibility);
    if (element.readyState >= 1) metadata();
    return () => {
      send();
      active = false;
      element.removeEventListener('loadedmetadata', metadata);
      element.removeEventListener('timeupdate', tick);
      element.removeEventListener('seeking', seek);
      element.removeEventListener('pause', pause);
      element.removeEventListener('ended', pause);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [api, courseId, lesson.id, lesson.durationSeconds, url]);
  return (
    <div className="course-video">
      {url ? (
        <video
          ref={video}
          src={url}
          controls
          controlsList="nodownload"
          onContextMenu={(event) => event.preventDefault()}
          aria-label={`فيديو الدرس: ${lesson.title}`}
          playsInline
          preload="metadata"
          onError={() => setError('تعذّر تشغيل الفيديو. أعد تحميله.')}
        />
      ) : (
        !error && <p role="status">جار تحميل الفيديو…</p>
      )}
      <div className="course-bookmark-controls">
        <button className="course-control" disabled={!url || bookmarkBusy} onClick={() => {
          video.current?.pause();
          setBookmarkError('');
          setDraft({ id: crypto.randomUUID(), position: Math.min(video.current?.currentTime ?? 0, lesson.durationSeconds), note: '' });
        }}><BrandIcon name="save" />أضف علامة</button>
      </div>
      {draft && (
        <form className="course-bookmark-editor" onSubmit={(event) => { event.preventDefault(); void writeBookmark(); }}>
          <label>ملاحظة عند <bdi>{timestamp(draft.position)}</bdi>
            <textarea maxLength={2000} value={draft.note} placeholder="ما الذي تريد تذكّره؟" onChange={(event) => setDraft({ ...draft, note: event.target.value })} disabled={bookmarkBusy} />
          </label>
          <div className="course-bookmark-controls">
            <BusyButton className="course-button" loadingMode="replace" aria-busy={bookmarkBusy} disabled={bookmarkBusy} type="submit"><BrandIcon name="save" />حفظ العلامة</BusyButton>
            <button type="button" className="course-control" disabled={bookmarkBusy} onClick={() => setDraft(null)}>إلغاء</button>
            {bookmarks?.[draft.id] && <BusyButton type="button" className="course-control" loadingMode="replace" aria-busy={bookmarkBusy} disabled={bookmarkBusy} onClick={() => void writeBookmark(true)}>حذف العلامة</BusyButton>}
          </div>
          {bookmarkError && <p role="alert">{bookmarkError}</p>}
        </form>
      )}
      {marks.length > 0 && (
        <div className="course-bookmarks" aria-label="علامات الفيديو">
          {marks.map(([id, mark]) => (
            <div className="course-bookmark" key={id}>
              <button className="course-control" aria-label={`انتقل إلى ${timestamp(mark.position)}`} disabled={!url} onClick={() => {
                if (video.current) { video.current.currentTime = mark.position; void video.current.play().catch(() => {}); }
              }}><BrandIcon name="play" /><bdi>{timestamp(mark.position)}</bdi></button>
              <p>{mark.note || 'علامة بدون ملاحظة'}</p>
              <button className="course-control" aria-label="تعديل الملاحظة" title="تعديل الملاحظة" disabled={bookmarkBusy} onClick={() => { setBookmarkError(''); setDraft({ id, position: mark.position, note: mark.note }); }}><BrandIcon name="edit" /></button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            onClick={() => {
              initial.current = video.current?.currentTime ?? initial.current;
              setRetry(retry + 1);
            }}
          >
            أعد تحميل الفيديو
          </button>
        </div>
      )}
    </div>
  );
}
