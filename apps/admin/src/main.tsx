import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getAppConfig } from './app/config';
import {
  createAdminRepository,
  createFixtureAdminAuthGateway,
  FixtureAdminAuthGateway,
  type AdminAuthGateway,
  type DemoAdminAccount,
} from './data';
import './app/globals.css';

const config = getAppConfig();

async function createAuthGateway(): Promise<AdminAuthGateway> {
  if (config.authMode === 'supabase') {
    if (!config.supabase) throw new Error('Supabase browser configuration is missing.');
    const { createSupabaseAdminAuthGateway } = await import(
      './data/supabase-admin-auth-gateway'
    );
    return createSupabaseAdminAuthGateway(config.supabase);
  }
  if (config.authMode === 'dev-header') {
    const devUserId = config.api.devUserId;
    if (!devUserId) throw new Error('The development API identity is missing.');
    const account: DemoAdminAccount = {
      id: devUserId,
      name: 'حساب تطوير API',
      email: 'studio@dev.mukhtalif.local',
      password: 'StudioDev123!',
      role: 'admin',
      locale: 'ar',
    };
    return createFixtureAdminAuthGateway({ accounts: [account] });
  }
  return createFixtureAdminAuthGateway();
}

const root = document.getElementById('root');

if (!root) throw new Error('Admin root element was not found.');
const adminRoot = root;

async function startAdmin(): Promise<void> {
  const authGateway = await createAuthGateway();
  const repository = createAdminRepository({
    getAccessToken:
      authGateway.kind === 'supabase' ? () => authGateway.getAccessToken() : undefined,
    fixture: {
      getAuthenticatedSubject: () => authGateway.getCurrentSession()?.subject ?? null,
      registerAuthAccount:
        authGateway instanceof FixtureAdminAuthGateway
          ? (account) => {
              authGateway.registerAccount(account);
            }
          : undefined,
      updateAuthAccountRole:
        authGateway instanceof FixtureAdminAuthGateway
          ? (id, role) => {
              authGateway.updateAccountRole(id, role);
            }
          : undefined,
    },
  });

  createRoot(adminRoot).render(
    <StrictMode>
      <App authGateway={authGateway} repository={repository} />
    </StrictMode>,
  );
}

void startAdmin();
