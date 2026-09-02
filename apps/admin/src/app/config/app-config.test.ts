import { describe, expect, it } from 'vitest';
import { AppConfigurationError, parseAppConfig } from './app-config';

describe('parseAppConfig', () => {
  it('uses fixture data only for development by default', () => {
    const config = parseAppConfig({ MODE: 'development', DEV: true, PROD: false });

    expect(config.dataSource).toBe('fixture');
    expect(config.api.baseUrl).toBe('http://localhost:8787');
    expect(config.isDevelopment).toBe(true);
    expect(config.authMode).toBe('fixture');
  });

  it('requires an explicit Hono API origin in production', () => {
    expect(() => parseAppConfig({ MODE: 'production', PROD: true })).toThrowError(
      AppConfigurationError,
    );
  });

  it('rejects a development identity in production', () => {
    expect(() =>
      parseAppConfig({
        MODE: 'production',
        PROD: true,
        VITE_API_URL: 'https://api.mukhtalif.example',
        VITE_DEV_USER_ID: 'usr-admin-1',
      }),
    ).toThrowError(/VITE_DEV_USER_ID/);
  });

  it('requires complete Supabase browser configuration', () => {
    expect(() =>
      parseAppConfig({
        MODE: 'development',
        DEV: true,
        VITE_SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrowError(/VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/);
  });

  it('requires browser authentication configuration in production', () => {
    expect(() =>
      parseAppConfig({
        MODE: 'production',
        PROD: true,
        VITE_API_URL: 'https://api.mukhtalif.example',
      }),
    ).toThrowError(/required in production/);
  });

  it('selects Supabase auth for a configured Hono application', () => {
    const config = parseAppConfig({
      MODE: 'production',
      PROD: true,
      VITE_API_URL: 'https://api.mukhtalif.example',
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    });

    expect(config.authMode).toBe('supabase');
  });

  it('keeps the explicit local API identity on a single dev-header auth path', () => {
    const config = parseAppConfig({
      MODE: 'development',
      DEV: true,
      VITE_ADMIN_DATA_SOURCE: 'hono',
      VITE_API_URL: 'http://localhost:8787',
      VITE_DEV_USER_ID: 'usr-admin-1',
    });

    expect(config.authMode).toBe('dev-header');
  });
});
