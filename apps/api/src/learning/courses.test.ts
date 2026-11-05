import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../index';
import type { Env } from '../env';
import { learningRequest } from './service';
import type * as Service from './service';
vi.mock('./service', async (original) => ({
  ...(await original<typeof Service>()),
  learningRequest: vi.fn(),
}));
const env: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  LEARNING_SIMULATION_ENABLED: 'true',
};
const upstream = vi.mocked(learningRequest);
beforeEach(() => {
  upstream.mockReset();
  upstream.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllGlobals());
function request(
  path: string,
  options: { user?: string; surface?: string; body?: unknown; environment?: Env } = {},
) {
  return app.request(
    path,
    {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mukhtalif-client': options.surface ?? 'web',
        ...(options.user ? { 'x-dev-user': options.user } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    options.environment ?? env,
  );
}
describe('learning trust boundary', () => {
  it('denies anonymous access and learner access to Studio before accessing learning data', async () => {
    expect((await request('/app/courses/course-1')).status).toBe(401);
    expect(
      (await request('/studio/courses', { user: 'usr-listener-1', surface: 'studio' })).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('keeps public catalogue responses in the public action', async () => {
    expect((await request('/courses')).status).toBe(200);
    expect(upstream.mock.calls[0].slice(1, 4)).toEqual(['catalog', {}, undefined]);
  });
  it('takes the actor from verified auth and rejects forged checkout fields', async () => {
    const invalid = await request('/app/courses/course-1/checkout', {
      user: 'usr-listener-1',
      body: { mode: 'simulation', outcome: 'success', member: 'victim', amount: 0 },
    });
    expect(invalid.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
    const valid = await request('/app/courses/course-1/checkout', {
      user: 'usr-listener-1',
      body: { mode: 'simulation', outcome: 'success' },
    });
    expect(valid.status).toBe(200);
    const envelope = {
      actor: upstream.mock.calls[0][3]!,
      payload: upstream.mock.calls[0][2] as { courseId: string },
    };
    expect(envelope.actor.id).toBe('dev:usr-listener-1');
    expect(envelope.actor.admin).toBe(false);
    expect(envelope.payload.courseId).toBe('course-1');
  });
  it('fails closed unless simulation is explicitly enabled', async () => {
    expect(
      (
        await request('/app/courses/course-1/checkout', {
          user: 'usr-listener-1',
          body: { mode: 'simulation', outcome: 'success' },
          environment: { ...env, LEARNING_SIMULATION_ENABLED: undefined },
        })
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects injected progress and grades', async () => {
    expect(
      (
        await request('/app/courses/course-1/progress', {
          user: 'usr-listener-1',
          body: { lessonId: 'lesson-1', position: 30, complete: true },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request('/app/courses/course-1/quiz', {
          user: 'usr-listener-1',
          body: { quizId: 'quiz-1', answers: {}, percentage: 100 },
        })
      ).status,
    ).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('does not expose database errors', async () => {
    upstream.mockRejectedValue(new Error('sensitive database error'));
    const response = await request('/courses');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('sensitive');
  });
});

describe('course upload size limits', () => {
  it.each([
    ['video.mp4', 5 * 1024 ** 3],
    ['video.WEBM', 5 * 1024 ** 3],
    ['audio.mp3', 1024 ** 3],
    ['worksheet.pdf', 100 * 1024 ** 2],
  ])('accepts the limit and rejects excess bytes for %s', async (filename, size) => {
    const options = { user: 'usr-admin-1', surface: 'studio' };
    const valid = await request('/studio/courses/course-1/upload-start', {
      ...options,
      body: { filename, size },
    });
    expect(valid.status).toBe(200);
    upstream.mockClear();
    const oversized = await request('/studio/courses/course-1/upload-start', {
      ...options,
      body: { filename, size: size + 1 },
    });
    expect(oversized.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('allows multipart offsets beyond 512 MiB without increasing chunk size', async () => {
    const response = await request('/studio/courses/course-1/upload-chunk', {
      user: 'usr-admin-1',
      surface: 'studio',
      body: { token: 'asset', offset: 4 * 1024 ** 3, content: 'YQ==' },
    });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalled();
  });
});
