'use client';
import { useCallback } from 'react';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';
import { useCustomer } from '../customer-provider';

export class CourseApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function useCoursesApi() {
  const { client, config, user } = useCustomer();
  return useCallback(
    async <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
      if (!config.apiOrigin) throw new Error('خدمة الدورات غير متاحة الآن.');
      const session = client ? (await client.auth.getSession()).data.session : null;
      if (path.startsWith('/app/') && (!session || session.user.id !== user?.id))
        throw new Error('سجّل الدخول للوصول إلى دورتك.');
      const response = await fetch(`${config.apiOrigin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        signal,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          [CLIENT_SURFACE_HEADER]: 'web',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new CourseApiError(
          response.status,
          typeof result.error === 'string' && /[\u0600-\u06ff]/.test(result.error)
            ? result.error
            : 'تعذّر إكمال الطلب. حاول مجددًا.',
        );
      return result as T;
    },
    [client, config.apiOrigin, user?.id],
  );
}
