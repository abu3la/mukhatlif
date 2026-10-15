import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../index';
import type { Env } from '../env';
import { learningRequest } from './frappe';
const env: Env = {
  APP_ENV: 'development',
  ALLOW_DEV_AUTH: 'true',
  LEARNING_URL: 'http://localhost:8000',
  LEARNING_API_KEY: 'test-key',
  LEARNING_API_SECRET: 'test-secret',
  LEARNING_SIMULATION_ENABLED: 'true',
};
const upstream = vi.fn();
beforeEach(() => {
  upstream.mockReset();
  upstream.mockResolvedValue(Response.json({ message: { data: { ok: true } } }));
  vi.stubGlobal('fetch', upstream);
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
  it('denies anonymous access and learner access to Studio before contacting Frappe', async () => {
    expect((await request('/app/courses/course-1')).status).toBe(401);
    expect(
      (await request('/studio/courses', { user: 'usr-listener-1', surface: 'studio' })).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('keeps public catalogue responses in the public action', async () => {
    expect((await request('/courses')).status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({
      action: 'catalog',
      payload: {},
      actor: null,
    });
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
    const envelope = JSON.parse(upstream.mock.calls[0][1].body);
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
  it('returns an honest unavailable state when no Frappe service is configured', async () => {
    const response = await request('/courses', { environment: { APP_ENV: 'development' } });
    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('does not expose upstream traces, redirect credentials or raw errors', async () => {
    upstream.mockResolvedValue(new Response('sensitive upstream traceback', { status: 500 }));
    await expect(learningRequest(env, 'catalog', {})).rejects.toThrow('تعذّر إكمال الطلب');
    expect(upstream.mock.calls[0][1].redirect).toBe('error');
  });
});
