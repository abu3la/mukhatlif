import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminAuthContext, type AdminAuthContextValue } from '@/application';
import type { AdminAuthGateway, AdminAuthSession, AdminRepository } from '@/data';
import { isAdminRepositoryError } from '@/data/repository-error';
import type { AdminViewer } from '@/lib';

interface AuthState {
  readonly status: AdminAuthContextValue['status'];
  readonly viewer: AdminViewer | null;
  readonly deniedEmail: string | null;
  readonly error: Error | null;
}

const RESTORING_STATE: AuthState = {
  status: 'restoring',
  viewer: null,
  deniedEmail: null,
  error: null,
};

export function AdminAuthProvider({
  authGateway,
  children,
  repository,
}: {
  authGateway: AdminAuthGateway;
  children: ReactNode;
  repository: AdminRepository;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(RESTORING_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operationSequence = useRef(0);
  const previousSubjectId = useRef<string | null>(null);

  const resolveSession = useCallback(
    async (session: AdminAuthSession | null, showRestoring = false): Promise<void> => {
      const operation = ++operationSequence.current;
      if (!session) {
        const hadAuthenticatedSubject = previousSubjectId.current !== null;
        previousSubjectId.current = null;
        if (hadAuthenticatedSubject) queryClient.clear();
        setState({ status: 'signed-out', viewer: null, deniedEmail: null, error: null });
        return;
      }

      if (previousSubjectId.current !== null && previousSubjectId.current !== session.subject.id) {
        queryClient.clear();
      }
      previousSubjectId.current = session.subject.id;
      if (showRestoring) setState(RESTORING_STATE);

      try {
        const viewer = await repository.readViewer();
        if (operation !== operationSequence.current) return;
        setState({
          status: 'authenticated',
          viewer,
          deniedEmail: null,
          error: null,
        });
      } catch (cause) {
        if (operation !== operationSequence.current) return;
        const error = cause instanceof Error ? cause : new Error('Unknown authentication error.');
        if (
          isAdminRepositoryError(error) &&
          (error.code === 'UNAUTHENTICATED' || error.code === 'FORBIDDEN')
        ) {
          setState({
            status: 'denied',
            viewer: null,
            deniedEmail: session.subject.email,
            error: null,
          });
          return;
        }
        setState({ status: 'error', viewer: null, deniedEmail: null, error });
      }
    },
    [queryClient, repository],
  );

  useEffect(() => {
    const unsubscribe = authGateway.subscribe((session) => {
      void resolveSession(session);
    });
    void authGateway
      .restoreSession()
      .then((session) => resolveSession(session, true))
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error('Unknown session restore error.');
        setState({ status: 'error', viewer: null, deniedEmail: null, error });
      });
    return () => {
      operationSequence.current += 1;
      unsubscribe();
    };
  }, [authGateway, resolveSession]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setIsSubmitting(true);
      try {
        const session = await authGateway.signInWithPassword(email, password);
        await resolveSession(session);
      } finally {
        setIsSubmitting(false);
      }
    },
    [authGateway, resolveSession],
  );

  const signOut = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await authGateway.signOut();
      await resolveSession(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [authGateway, resolveSession]);

  const requestPasswordChangeVerification = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await authGateway.requestPasswordChangeVerification();
    } finally {
      setIsSubmitting(false);
    }
  }, [authGateway]);

  const changePassword = useCallback(
    async (password: string, verificationCode: string): Promise<void> => {
      setIsSubmitting(true);
      try {
        await authGateway.changePassword(password, verificationCode);
      } finally {
        setIsSubmitting(false);
      }
    },
    [authGateway],
  );

  const retry = useCallback(async (): Promise<void> => {
    setState(RESTORING_STATE);
    try {
      const session = authGateway.getCurrentSession() ?? (await authGateway.restoreSession());
      await resolveSession(session);
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Unknown session restore error.');
      setState({ status: 'error', viewer: null, deniedEmail: null, error });
    }
  }, [authGateway, resolveSession]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      ...state,
      isSubmitting,
      demoAccounts: authGateway.demoAccounts,
      signIn,
      requestPasswordChangeVerification,
      changePassword,
      signOut,
      retry,
    }),
    [
      authGateway.demoAccounts,
      changePassword,
      isSubmitting,
      requestPasswordChangeVerification,
      retry,
      signIn,
      signOut,
      state,
    ],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
