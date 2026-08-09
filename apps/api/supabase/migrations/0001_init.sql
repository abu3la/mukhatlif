-- Mukhtalif platform — initial schema + seed.
-- Money is integer minor units (halalas); currency is ISO 4217.
-- Arabic is the source language: *_ar columns are required, *_en optional.

create type user_role as enum ('listener', 'admin');
create type episode_status as enum ('draft', 'scheduled', 'published', 'archived');
create type article_status as enum ('draft', 'published');
create type subscription_status as enum ('active', 'past_due', 'canceled');
create type plan_interval as enum ('month', 'year');

create table users (
  id text primary key,
  email text not null unique,
  display_name text not null,
  role user_role not null default 'listener',
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  created_at timestamptz not null default now()
);

create table shows (
  id text primary key default ('shw-' || substr(gen_random_uuid()::text, 1, 8)),
  slug text not null unique,
  title_ar text not null,
  title_en text,
  description_ar text not null,
  description_en text,
  host_name text not null,
  artwork_url text,
  category text not null,
  premium boolean not null default false,
  created_at timestamptz not null default now()
);

create table episodes (
  id text primary key default ('ep-' || substr(gen_random_uuid()::text, 1, 8)),
  show_id text not null references shows (id),
  title_ar text not null,
  title_en text,
  show_notes_ar text not null default '',
  show_notes_en text,
  audio_key text,
  audio_url text,
  duration_sec integer not null default 0 check (duration_sec >= 0),
  episode_number integer not null,
  premium boolean not null default false,
  status episode_status not null default 'draft',
  publish_at timestamptz,
  created_at timestamptz not null default now()
);

create index episodes_show_idx on episodes (show_id);
create index episodes_status_idx on episodes (status);
create index episodes_publish_at_idx on episodes (publish_at desc);

create table articles (
  id text primary key default ('art-' || substr(gen_random_uuid()::text, 1, 8)),
  slug text not null unique,
  title_ar text not null,
  title_en text,
  body_ar text not null,
  cover_url text,
  status article_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table plans (
  id text primary key,
  name_ar text not null,
  name_en text,
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null default 'SAR',
  interval plan_interval not null default 'month'
);

create table subscriptions (
  id text primary key default ('sub-' || substr(gen_random_uuid()::text, 1, 8)),
  user_id text not null references users (id),
  plan_id text not null references plans (id),
  status subscription_status not null default 'active',
  -- Price snapshot at subscription time; later plan changes never affect existing subscribers.
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null default 'SAR',
  current_period_end timestamptz not null,
  created_at timestamptz not null default now()
);

create index subscriptions_user_idx on subscriptions (user_id);

create table follows (
  user_id text not null references users (id),
  show_id text not null references shows (id),
  created_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create table playback_progress (
  user_id text not null references users (id),
  episode_id text not null references episodes (id),
  position_sec integer not null default 0 check (position_sec >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create index playback_progress_user_idx on playback_progress (user_id);

-- The API talks to Postgres with the service-role key; row-level security stays
-- on so anon/authenticated keys can't touch these tables until policies exist.
alter table users enable row level security;
alter table shows enable row level security;
alter table episodes enable row level security;
alter table articles enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table follows enable row level security;
alter table playback_progress enable row level security;

-- ---------------------------------------------------------------------------
-- Seed (mirrors apps/api/src/repo/memory.ts)
-- ---------------------------------------------------------------------------

insert into users (id, email, display_name, role, locale, created_at) values
  ('usr-admin-1', 'studio@mukhtalif.net', 'فريق مختلف', 'admin', 'ar', '2026-01-10T08:00:00Z'),
  ('usr-listener-1', 'sara@example.com', 'سارة الحربي', 'listener', 'ar', '2026-02-02T10:30:00Z'),
  ('usr-listener-2', 'khalid@example.com', 'خالد العتيبي', 'listener', 'ar', '2026-03-15T14:12:00Z');

insert into shows (id, slug, title_ar, title_en, description_ar, host_name, category, premium, created_at) values
  ('shw-petroly', 'petroly', 'بترولي', 'Petroly', 'لقاءات مع مهنيين ملهمين يشاركون تجاربهم في مسيرتهم المهنية.', 'أحمد العطار', 'مسيرة مهنية', false, '2026-01-12T08:00:00Z'),
  ('shw-gilaf', 'gilaf', 'غلاف', 'Gilaf', 'كتب أجنبية نناقشها ونسقطها على واقعنا العربي.', 'محمد المرشدي', 'كتب', false, '2026-01-12T08:05:00Z'),
  ('shw-shaqla', 'shaqla', 'شقلة', 'Shaqla', 'نغوص في تفاصيل المهن مع مختصين يعيشونها يوميًا.', 'عبدالله إسحاق', 'مهن', false, '2026-01-12T08:10:00Z'),
  ('shw-partition', 'partition', 'بارتشن', 'Partition', 'قضايا بيئة العمل من منظور الجنسين في حوار مفتوح.', 'أحمد حسن مشرف', 'بيئة عمل', false, '2026-01-12T08:15:00Z'),
  ('shw-seera', 'seera', 'سيرة', 'Seera', 'سير مهنية تُروى من أصحابها، بتفاصيلها الصعبة قبل الجميلة.', 'فريق مختلف', 'سير', true, '2026-01-20T08:00:00Z');

insert into episodes (id, show_id, title_ar, show_notes_ar, audio_url, duration_sec, episode_number, premium, status, publish_at, created_at) values
  ('ep-1001', 'shw-petroly', 'من الحقل إلى الإدارة: رحلة مهندس', 'ضيف الحلقة يشارك تحولات مسيرته من مواقع الحفر إلى قيادة الفرق.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 2520, 1, false, 'published', '2026-06-04T05:00:00Z', '2026-06-01T09:00:00Z'),
  ('ep-1002', 'shw-petroly', 'أول وظيفة في قطاع الطاقة', 'كيف تقرأ عرض العمل الأول، وما الذي يستحق التفاوض عليه.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 1980, 2, false, 'published', '2026-06-18T05:00:00Z', '2026-06-15T09:00:00Z'),
  ('ep-2001', 'shw-gilaf', 'عادات ذرية: هل تصمد في بيئة عربية؟', 'نقرأ الكتاب الأشهر في الإنتاجية ونسأل: ما الذي يترجم فعلًا؟', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 3120, 1, false, 'published', '2026-06-25T05:00:00Z', '2026-06-20T09:00:00Z'),
  ('ep-3001', 'shw-shaqla', 'يوم في حياة مراقب جوي', 'مهنة لا تحتمل الخطأ: كيف تُدار السماء من برج المراقبة.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 2760, 1, false, 'published', '2026-07-02T05:00:00Z', '2026-06-28T09:00:00Z'),
  ('ep-4001', 'shw-partition', 'الترقية الأولى: من يطلبها ومن ينتظرها؟', 'حوار مفتوح حول الفروق في طلب الترقيات والمبادرة داخل الفريق.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 2340, 1, false, 'published', '2026-07-09T05:00:00Z', '2026-07-05T09:00:00Z'),
  ('ep-5001', 'shw-seera', 'سيرة: من التقاعد المبكر إلى تأسيس شركة', 'حلقة حصرية للمشتركين: قصة كاملة من القرار الصعب إلى أول عميل.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 3600, 1, true, 'published', '2026-07-16T05:00:00Z', '2026-07-10T09:00:00Z'),
  ('ep-1003', 'shw-petroly', 'الانتقال بين الشركات الكبرى', 'مسودة قيد التحرير.', null, 0, 3, false, 'draft', null, '2026-08-01T09:00:00Z'),
  ('ep-2002', 'shw-gilaf', 'كيف تقرأ سيرة ذاتية؟ الكتاب خلف التوظيف', 'مجدولة للأسبوع القادم.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 2880, 2, false, 'scheduled', '2026-08-20T05:00:00Z', '2026-08-05T09:00:00Z'),
  ('ep-3002', 'shw-shaqla', 'الحلقة التجريبية الأولى', 'أرشيف الموسم صفر.', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 1500, 0, false, 'archived', '2026-02-01T05:00:00Z', '2026-01-28T09:00:00Z');

insert into articles (id, slug, title_ar, body_ar, status, published_at, created_at) values
  ('art-1', 'first-90-days', 'أول ٩٠ يومًا في وظيفتك الجديدة', 'الأشهر الثلاثة الأولى تحدد صورتك المهنية لسنوات. في هذا المقال نلخص ما ينصح به ضيوف مختلف: افهم قبل أن تقترح، وابنِ علاقات قبل أن تحتاجها، ووثّق أثرك من الأسبوع الأول.', 'published', '2026-07-20T08:00:00Z', '2026-07-18T08:00:00Z'),
  ('art-2', 'salary-negotiation', 'التفاوض على الراتب: دليل عملي', 'مسودة قيد المراجعة التحريرية.', 'draft', null, '2026-08-03T08:00:00Z');

insert into plans (id, name_ar, name_en, price_minor, currency, interval) values
  ('pln-plus', 'مختلف بلس', 'Mukhtalif Plus', 1900, 'SAR', 'month');

insert into subscriptions (id, user_id, plan_id, status, price_minor, currency, current_period_end, created_at) values
  ('sub-1001', 'usr-listener-1', 'pln-plus', 'active', 1900, 'SAR', '2026-09-01T00:00:00Z', '2026-06-01T00:00:00Z');

insert into follows (user_id, show_id, created_at) values
  ('usr-listener-1', 'shw-petroly', '2026-06-05T10:00:00Z'),
  ('usr-listener-1', 'shw-seera', '2026-07-16T10:00:00Z');

insert into playback_progress (user_id, episode_id, position_sec, updated_at) values
  ('usr-listener-1', 'ep-1001', 1130, '2026-08-06T21:14:00Z');
