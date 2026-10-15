'use client';
import { useEffect, useRef, useState } from 'react';
import type { CourseEnrollment, CourseLesson } from '@mukhtalif/types';
import { useCoursesApi } from './api';

export function CourseVideo({
  courseId,
  lesson,
  initialPosition,
  onSaved,
}: {
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
  const [status, setStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const flush = useRef<() => void>(() => {});
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
            setStatus('حُفظ موضعك');
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(`${e.message} قد لا يُحفظ آخر موضع.`);
        });
    };
    flush.current = () => send();
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
          playsInline
          preload="metadata"
          onError={() => setError('تعذّر تشغيل الفيديو. أعد تحميله.')}
        />
      ) : (
        !error && <p role="status">جارٍ تحميل الفيديو…</p>
      )}
      <div className="course-video-status">
        <span role="status">{status}</span>
        <button onClick={() => flush.current()}>احفظ موضعي</button>
      </div>
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
