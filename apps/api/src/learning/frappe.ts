import { ApiConfigurationError, type Env } from '../env';

export class LearningError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
  }
}

/** This credential and the actor envelope never reach either browser. */
export async function learningRequest<T>(
  env: Env,
  action: string,
  payload: unknown,
  actor?: { id: string; name: string; admin: boolean },
): Promise<T> {
  if (!env.LEARNING_URL || !env.LEARNING_API_KEY || !env.LEARNING_API_SECRET)
    throw new LearningError(503, 'الدورات غير متاحة الآن. حاول لاحقًا.');
  const base = new URL(env.LEARNING_URL);
  if (
    base.protocol !== 'https:' &&
    !(env.APP_ENV === 'development' && ['localhost', '127.0.0.1'].includes(base.hostname))
  )
    throw new ApiConfigurationError('LEARNING_URL must use HTTPS.');
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/')
    throw new ApiConfigurationError('LEARNING_URL must be an origin.');
  let response: Response;
  try {
    response = await fetch(new URL('/api/method/mukhtalif_learning.api.dispatch', base), {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${env.LEARNING_API_KEY}:${env.LEARNING_API_SECRET}`,
      },
      body: JSON.stringify({ action, payload, actor: actor ?? null }),
    });
  } catch {
    throw new LearningError(503, 'تعذّر الاتصال بخدمة الدورات. حاول مجددًا.');
  }
  if (!response.ok) throw new LearningError(503, 'تعذّر إكمال الطلب. حاول مجددًا.');
  const result = (await response.json()) as {
    message?: { data?: T; error?: string; status?: number };
  };
  const message = result.message;
  if (!message) throw new LearningError(503, 'تعذّر قراءة بيانات الدورة.');
  if (message.error) {
    const status = [400, 403, 404, 409, 422].includes(message.status ?? 0)
      ? (message.status as 400 | 403 | 404 | 409 | 422)
      : 503;
    throw new LearningError(status, message.error);
  }
  return message.data as T;
}
