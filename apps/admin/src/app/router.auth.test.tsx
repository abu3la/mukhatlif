import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRolePermissionMatrix, type RolePermissionMatrix } from '@mukhtalif/types';
import {
  FIXTURE_ADMIN_ACCOUNTS,
  FIXTURE_CREATED_ACCOUNT_PASSWORD,
  FixtureAdminAuthGateway,
  createFixtureAdminRepository,
  type AdminRepository,
  type DemoAdminAccount,
} from '@/data';
import { MemoryStorage } from '@/test/memory-storage';
import { AppProviders } from './providers';
import { createAdminRoutes } from './router';

const activeResources: Array<{
  readonly router: { dispose(): void };
  readonly queryClient: QueryClient;
}> = [];

const APP_ONLY_AUTH_ACCOUNT: DemoAdminAccount = {
  id: 'user_noura',
  name: 'نورة الشمري',
  email: 'listener@demo.mukhtalif.local',
  password: 'Listener123!',
  role: 'editor',
  locale: 'ar',
};

async function renderRoute(
  path: string,
  accountIndex?: number,
  initialRolePermissions?: RolePermissionMatrix,
) {
  const gateway = new FixtureAdminAuthGateway({
    storage: new MemoryStorage(),
    accounts: accountIndex === 2 ? [...FIXTURE_ADMIN_ACCOUNTS, APP_ONLY_AUTH_ACCOUNT] : undefined,
  });
  if (accountIndex !== undefined) {
    const account = gateway.demoAccounts[accountIndex];
    if (!account) throw new Error('Missing fixture authentication account.');
    await gateway.signInWithPassword(account.email, account.password);
  }
  const repository = createFixtureAdminRepository({
    getAuthenticatedSubject: () => gateway.getCurrentSession()?.subject ?? null,
    registerAuthAccount: (account) => {
      gateway.registerAccount(account);
    },
    updateAuthAccountRole: (id, role) => {
      gateway.updateAccountRole(id, role);
    },
    initialRolePermissions,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(createAdminRoutes(repository, gateway), {
    initialEntries: [path],
  });
  render(
    <AppProviders authGateway={gateway} repository={repository} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  activeResources.push({ router, queryClient });
  return { gateway, queryClient, repository, router };
}

describe('admin auth routing', () => {
  afterEach(() => {
    cleanup();
    for (const { queryClient, router } of activeResources.splice(0)) {
      router.dispose();
      queryClient.clear();
    }
  });

  it('redirects an unauthenticated deep link before content queries mount', async () => {
    const { repository } = await renderRoute('/episodes');
    const readContent = vi.spyOn(repository, 'readContentWorkspace');

    expect(
      await screen.findByRole('heading', { name: 'الدخول إلى استوديو الإدارة' }),
    ).toBeInTheDocument();
    expect(readContent).not.toHaveBeenCalled();
  });

  it('denies an app-only listener before content queries mount', async () => {
    const { repository } = await renderRoute('/', 2);
    const readContent = vi.spyOn(repository, 'readContentWorkspace');

    expect(
      await screen.findByRole('heading', { name: 'لا تملك صلاحية دخول الاستوديو' }),
    ).toBeInTheDocument();
    expect(readContent).not.toHaveBeenCalled();
  });

  it('keeps an editor out of admin routes without loading the admin directory', async () => {
    const { repository } = await renderRoute('/subscribers', 1);
    const readDirectory = vi.spyOn(repository, 'readSubscriberDirectory');

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية عرض صفحة المشتركون',
      }),
    ).toBeInTheDocument();
    expect(readDirectory).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'المشتركون' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'الأدوار والصلاحيات' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'حسابات الاستوديو' })).not.toBeInTheDocument();
  });

  it('lets a forms viewer open the request inbox as a first-class Studio page', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['forms.view'];

    await renderRoute('/requests', 1, permissions);

    expect(await screen.findByRole('heading', { name: 'طلبات الموقع' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'أقسام الاستوديو' })).getByRole('link', {
        name: 'طلبات الموقع',
      }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'المقالات' })).not.toBeInTheDocument();
  });

  it('lets a subscriber viewer open the newsletter directory as a separate Studio page', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['subscribers.view'];

    await renderRoute('/newsletter', 1, permissions);

    expect(await screen.findByRole('heading', { name: 'النشرة البريدية' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'أقسام الاستوديو' })).getByRole('link', {
        name: 'النشرة البريدية',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('denies the newsletter directory before its repository query mounts', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['articles.view'];
    const { repository } = await renderRoute('/newsletter', 1, permissions);
    const listNewsletterSubscribers = vi.spyOn(repository, 'listNewsletterSubscribers');

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية عرض صفحة المشتركون',
      }),
    ).toBeInTheDocument();
    expect(listNewsletterSubscribers).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'النشرة البريدية' })).not.toBeInTheDocument();
  });

  it('denies the request inbox before its repository query mounts', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['articles.view'];
    const { repository } = await renderRoute('/requests', 1, permissions);
    const listFormSubmissions = vi.spyOn(repository, 'listFormSubmissions');

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية عرض صفحة طلبات الموقع',
      }),
    ).toBeInTheDocument();
    expect(listFormSubmissions).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'طلبات الموقع' })).not.toBeInTheDocument();
  });

  it('renders the roles page separately for an administrator', async () => {
    await renderRoute('/roles', 0);

    expect(await screen.findByRole('heading', { name: 'الأدوار والصلاحيات' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'إضافة حساب إداري' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الأدوار والصلاحيات' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('guards the add-user route with access management permission', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['access.view'];

    await renderRoute('/users/new', 1, permissions);

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية إدارة صفحة إدارة الوصول',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'بيانات حساب الاستوديو الجديد' }),
    ).not.toBeInTheDocument();
  });

  it('guards the new-role route with access management permission', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['access.view'];

    await renderRoute('/roles/new', 1, permissions);

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية إدارة صفحة إدارة الوصول',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'بيانات الدور الجديد' })).not.toBeInTheDocument();
  });

  it('lets an access viewer browse one role without editing it', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['access.view'];

    await renderRoute('/roles/editor', 1, permissions);

    expect(await screen.findByRole('heading', { name: 'مدير المحتوى' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'حفظ الصلاحيات' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'الحلقات' })).toBeDisabled();
    expect(
      within(screen.getByRole('navigation', { name: 'أقسام الاستوديو' })).getByRole('link', {
        name: 'الأدوار والصلاحيات',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('redirects the legacy access path to the roles page', async () => {
    const { router } = await renderRoute('/access', 0);

    expect(await screen.findByRole('heading', { name: 'الأدوار والصلاحيات' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/roles');
  });

  it('lets an administrator update another Studio account role', async () => {
    const user = userEvent.setup();
    await renderRoute('/users', 0);

    const select = await screen.findByRole('combobox', { name: 'دور ليان السبيعي' });
    await user.selectOptions(select, 'admin');
    const row = select.closest('article');
    if (!row) throw new Error('Expected the Studio account row for Layan.');
    await user.click(within(row).getByRole('button', { name: 'حفظ الدور' }));

    expect(await within(row).findByText('حُفظ دور ليان السبيعي.')).toHaveAttribute(
      'role',
      'status',
    );
    await waitFor(() => expect(select).toHaveValue('admin'));
    expect(within(row).getByRole('button', { name: 'حفظ الدور' })).toBeDisabled();
  });

  it('never shows app users in the Studio account directory', async () => {
    await renderRoute('/users', 0);

    await screen.findByRole('heading', { name: 'حسابات الاستوديو' });
    expect(screen.queryByText('ريم القحطاني')).not.toBeInTheDocument();
    expect(screen.queryByText('listener@demo.mukhtalif.local')).not.toBeInTheDocument();
  });

  it('creates a local account that can sign in with its assigned role permissions', async () => {
    const user = userEvent.setup();
    const { gateway, router } = await renderRoute('/users', 0);

    await screen.findByRole('heading', { name: 'حسابات الاستوديو' });
    await user.click(screen.getByRole('link', { name: 'إضافة حساب' }));
    expect(await screen.findByRole('heading', { name: 'إضافة حساب إداري' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/users/new');
    expect(
      within(screen.getByRole('navigation', { name: 'أقسام الاستوديو' })).getByRole('link', {
        name: 'حسابات الاستوديو',
      }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('navigation', { name: 'مسار الصفحة' })).toHaveTextContent(
      'حسابات الاستوديوإضافة حساب إداري',
    );
    await user.type(screen.getByRole('textbox', { name: 'الاسم' }), 'مها السالم');
    await user.type(
      screen.getByRole('textbox', { name: 'البريد الإلكتروني' }),
      'maha.salem@example.com',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'الدور الإداري' }), 'editor');
    await user.click(screen.getByRole('button', { name: 'إضافة الحساب' }));

    expect(await screen.findByText('أُضيف حساب مها السالم.')).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_CREATED_ACCOUNT_PASSWORD)).toBeInTheDocument();
    expect(gateway.demoAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'مها السالم',
          email: 'maha.salem@example.com',
          password: FIXTURE_CREATED_ACCOUNT_PASSWORD,
          role: 'editor',
          locale: 'ar',
        }),
      ]),
    );

    await user.click(
      within(screen.getByRole('navigation', { name: 'مسار الصفحة' })).getByRole('link', {
        name: 'حسابات الاستوديو',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'حسابات الاستوديو' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'قائمة حسابات الاستوديو' })).getByText(
        'maha.salem@example.com',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'إضافة حساب' }));
    expect(await screen.findByRole('heading', { name: 'إضافة حساب إداري' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
    await screen.findByRole('heading', { name: 'الدخول إلى استوديو الإدارة' });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'حساب العرض' }),
      gateway.demoAccounts.find((account) => account.email === 'maha.salem@example.com')?.id ?? '',
    );

    expect(screen.getByRole('textbox', { name: 'البريد الإلكتروني' })).toHaveValue(
      'maha.salem@example.com',
    );
    expect(screen.getByLabelText('كلمة المرور')).toHaveValue(FIXTURE_CREATED_ACCOUNT_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية إدارة صفحة إدارة الوصول',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('مها السالم')).toBeInTheDocument();
    expect(screen.getByText('مدير المحتوى')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'حسابات الاستوديو' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'الأدوار والصلاحيات' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'نظرة عامة' }));
    expect(await screen.findByRole('heading', { name: 'نظرة عامة' })).toBeInTheDocument();
  });

  it('creates a custom role, assigns it to a new user, and enforces it after login', async () => {
    const user = userEvent.setup();
    const { gateway } = await renderRoute('/roles/new', 0);

    expect(await screen.findByRole('heading', { name: 'دور جديد' })).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: 'اسم الدور' }), 'مراجع المقالات');
    await user.type(screen.getByRole('textbox', { name: /الوصف/ }), 'يراجع المقالات المنشورة.');
    await user.click(
      within(screen.getByRole('group', { name: 'المقالات' })).getByRole('radio', {
        name: 'عرض فقط',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'إنشاء الدور' }));

    expect(await screen.findByRole('heading', { name: 'مراجع المقالات' })).toHaveFocus();
    expect(
      within(screen.getByRole('navigation', { name: 'أقسام الاستوديو' })).getByRole('link', {
        name: 'الأدوار والصلاحيات',
      }),
    ).toHaveAttribute('aria-current', 'page');

    await user.click(
      within(screen.getByRole('navigation', { name: 'أقسام الاستوديو' })).getByRole('link', {
        name: 'حسابات الاستوديو',
      }),
    );
    await screen.findByRole('heading', { name: 'حسابات الاستوديو' });
    await user.click(screen.getByRole('link', { name: 'إضافة حساب' }));
    expect(await screen.findByRole('heading', { name: 'إضافة حساب إداري' })).toHaveFocus();
    await user.type(screen.getByRole('textbox', { name: 'الاسم' }), 'أروى المراجعة');
    await user.type(
      screen.getByRole('textbox', { name: 'البريد الإلكتروني' }),
      'arwa.reviewer@example.com',
    );
    const roleOption = screen.getByRole('option', { name: 'مراجع المقالات' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'الدور الإداري' }), roleOption);
    await user.click(screen.getByRole('button', { name: 'إضافة الحساب' }));
    expect(await screen.findByText('أُضيف حساب أروى المراجعة.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
    await screen.findByRole('heading', { name: 'الدخول إلى استوديو الإدارة' });
    const account = gateway.demoAccounts.find(
      (candidate) => candidate.email === 'arwa.reviewer@example.com',
    );
    if (!account) throw new Error('Expected the created reviewer account.');
    await user.selectOptions(screen.getByRole('combobox', { name: 'حساب العرض' }), account.id);
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية إدارة صفحة إدارة الوصول',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('مراجع المقالات')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'حسابات الاستوديو' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'الحلقات' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'المقالات' }));
    expect(await screen.findByRole('heading', { name: 'المقالات' })).toBeInTheDocument();
  });

  it('redirects the root to the first permitted page when overview is unavailable', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['articles.view'];

    const { router } = await renderRoute('/', 1, permissions);

    expect(await screen.findByRole('heading', { name: 'المقالات' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/articles');
    expect(screen.getByRole('link', { name: 'المقالات' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'الحلقات' })).not.toBeInTheDocument();
  });

  it('names a forbidden direct page and does not mount its data provider', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['articles.view'];
    const { repository } = await renderRoute('/episodes', 1, permissions);
    const readContent = vi.spyOn(repository, 'readContentWorkspace');

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية عرض صفحة الحلقات',
      }),
    ).toBeInTheDocument();
    expect(readContent).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /الانتقال إلى المقالات/ })).toHaveAttribute(
      'href',
      '/articles',
    );
  });

  it('requires manage permission at the new-episode route boundary', async () => {
    const permissions = createDefaultRolePermissionMatrix();
    permissions.editor = ['episodes.view'];

    await renderRoute('/episodes/new', 1, permissions);

    expect(
      await screen.findByRole('heading', {
        name: 'لا تملك صلاحية إدارة صفحة الحلقات',
      }),
    ).toBeInTheDocument();
  });

  it.each([
    { path: '/shows/new', page: 'shows', label: 'البرامج' },
    { path: '/articles/new', page: 'articles', label: 'المقالات' },
    { path: '/guests/new', page: 'guests', label: 'الضيوف' },
  ] as const)(
    'requires manage permission at the $path route boundary',
    async ({ label, page, path }) => {
      const permissions = createDefaultRolePermissionMatrix();
      permissions.editor = [`${page}.view`];

      await renderRoute(path, 1, permissions);

      expect(
        await screen.findByRole('heading', {
          name: `لا تملك صلاحية إدارة صفحة ${label}`,
        }),
      ).toBeInTheDocument();
    },
  );

  it('omits guest routes when the repository does not support guest management', () => {
    const repository = createFixtureAdminRepository();
    const repositoryWithoutGuests = Object.create(repository) as AdminRepository;
    Object.defineProperty(repositoryWithoutGuests, 'capabilities', {
      value: { ...repository.capabilities, 'guest-management': false },
    });

    // Only the route table is inspected here, so a bare gateway is enough.
    const studioRoute = createAdminRoutes(
      repositoryWithoutGuests,
      new FixtureAdminAuthGateway({ storage: null }),
    ).find((route) => route.id === 'studio');
    const routeIds = studioRoute?.children?.map((route) => route.id);

    expect(routeIds).not.toContain('guests');
    expect(routeIds).not.toContain('guest-new');
    expect(routeIds).not.toContain('guest-details');
  });

  it('clears cached data on sign-out and returns to login', async () => {
    const user = userEvent.setup();
    const { queryClient } = await renderRoute('/', 0);
    queryClient.setQueryData(['private-test-record'], { secret: true });
    await screen.findByRole('heading', { name: 'نظرة عامة' });

    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    expect(
      await screen.findByRole('heading', { name: 'الدخول إلى استوديو الإدارة' }),
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(['private-test-record'])).toBeUndefined();
  });
});
