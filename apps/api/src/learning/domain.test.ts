import { describe, it, expect } from 'vitest';
import {
  definition,
  learnerCourse,
  summary,
  updateState,
  publicState,
  eligible,
  type State,
} from './domain';
const course = () =>
  definition({
    id: 'course',
    title: 'دورة',
    description: 'وصف',
    category: '',
    skill: '',
    level: '',
    instructor: '',
    price: 100,
    published: true,
    resources: [],
    lessons: [
      {
        id: 'reading',
        title: 'القراءة',
        body: 'نص',
        video: '',
        durationSeconds: 0,
        resources: [],
        quiz: {
          id: 'quiz',
          title: 'اختبار',
          maxAttempts: 2,
          passPercent: 100,
          questions: [{ id: 'q', prompt: 'سؤال', options: ['صحيح', 'خطأ'], correct: 0 }],
        },
        assignment: { id: 'work', title: 'تطبيق', instructions: 'طبّق', required: true, file: '' },
      },
    ],
  });
const state = (): State => ({
  courseId: 'course',
  lastLesson: null,
  progress: {},
  quizzes: {},
  assignments: {},
  certificate: null,
  order: { id: 'order', mode: 'simulation', amount: 100, createdAt: 'now' },
  _ranges: {},
  _reported: {},
});
describe('native learning rules', () => {
  it('hides private lessons and answers', () => {
    const c = course();
    expect(summary(c)).not.toHaveProperty('lessons');
    expect(learnerCourse(c).lessons[0].quiz!.questions[0]).not.toHaveProperty('correct');
  });
  it('requires every completion condition before issuing one stable certificate', () => {
    const c = course(),
      s = state();
    expect(() => updateState(c, s, 'certificate', {}, 'متعلم')).toThrow();
    updateState(c, s, 'progress', { lessonId: 'reading', position: 0, readPercent: 100 }, 'متعلم');
    updateState(c, s, 'quiz', { quizId: 'quiz', answers: { q: 0 } }, 'متعلم');
    expect(eligible(c, s)).toBe(false);
    updateState(c, s, 'assignment', { assignmentId: 'work', answer: 'تطبيق' }, 'متعلم');
    s.assignments.work.status = 'Pass';
    expect(eligible(c, s)).toBe(true);
    updateState(c, s, 'certificate', {}, 'متعلم');
    const id = s.certificate!.id;
    updateState(c, s, 'certificate', {}, 'متعلم');
    expect(s.certificate!.id).toBe(id);
    expect(publicState(s)).not.toHaveProperty('_ranges');
  });
  it('counts attempts server-side and validates complete answer sets', () => {
    const c = course(),
      s = state();
    updateState(c, s, 'progress', { lessonId: 'reading', position: 0, readPercent: 100 }, 'متعلم');
    expect(() => updateState(c, s, 'quiz', { quizId: 'quiz', answers: {} }, 'متعلم')).toThrow();
    for (let i = 0; i < 2; i++)
      updateState(c, s, 'quiz', { quizId: 'quiz', answers: { q: 1 } }, 'متعلم');
    expect(() => updateState(c, s, 'quiz', { quizId: 'quiz', answers: { q: 0 } }, 'متعلم')).toThrow(
      'استهلكت',
    );
  });
  it('does not complete video by seeking or overlapping ranges', () => {
    const c = course();
    c.lessons[0].video = '/private/files/video.mp4';
    c.lessons[0].durationSeconds = 100;
    const s = state();
    updateState(c, s, 'progress', { lessonId: 'reading', position: 100 }, 'متعلم', 1000);
    expect(s.progress.reading.complete).toBe(false);
    updateState(
      c,
      s,
      'progress',
      { lessonId: 'reading', position: 10, start: 0, end: 10 },
      'متعلم',
      11000,
    );
    updateState(
      c,
      s,
      'progress',
      { lessonId: 'reading', position: 10, start: 0, end: 10 },
      'متعلم',
      21000,
    );
    expect(s.progress.reading.watched).toBe(10);
    expect(() =>
      updateState(
        c,
        s,
        'progress',
        { lessonId: 'reading', position: 100, start: 10, end: 100 },
        'متعلم',
        22000,
      ),
    ).toThrow();
  });
  it('preserves reading progress and rejects duplicated IDs', () => {
    const c = course(),
      s = state();
    updateState(c, s, 'progress', { lessonId: 'reading', position: 0, readPercent: 70 }, 'متعلم');
    updateState(c, s, 'progress', { lessonId: 'reading', position: 0, readPercent: 10 }, 'متعلم');
    expect(s.progress.reading.readPercent).toBe(70);
    c.lessons.push(c.lessons[0]);
    expect(() => definition(c)).toThrow();
  });
  it('persists blog documents and renders escaped HTML on the server', () => {
    const c = course();
    c.overviewDocument = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '<script>unsafe</script>' }],
        },
      ],
    };
    const saved = definition(c);
    expect(saved.overview).toContain('<script>');
    expect(summary(saved).overviewHtml).toContain('&lt;script&gt;');
    expect(summary(saved).overviewHtml).not.toContain('<script>');
  });
});
