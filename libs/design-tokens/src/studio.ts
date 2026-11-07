/**
 * Studio design tokens (apps/admin): the single source of truth for the
 * dashboard's colour, type, spacing, radius, layout and motion.
 *
 * Change a value here, then run `pnpm design:build`. That regenerates
 * `apps/admin/src/app/styles/00-tokens.css` and the tables in
 * `design-system/STUDIO.md`. Never edit those outputs by hand;
 * `pnpm design:check` fails when they drift.
 *
 * The Studio has one appearance (light). Every token is emitted once as
 * `--st-<name>`. The older `--ink`, `--canvas`, `--line` … names in the Studio
 * CSS are aliases of these tokens (see `01-fonts-tokens-base.css`).
 *
 * `label` is the Arabic name; `role` says where the token belongs. Read the
 * role before choosing a token.
 */
import type { ScaleToken } from './web';

const token = (value: string, label: string, role: string): ScaleToken => ({ value, label, role });

/** Grounds and ink. */
export const studioColor = {
  canvas: token(
    '#eceef7',
    'أرضية اللوحة',
    'Page ground behind the content column. Tinted toward the brand indigo so white cards read as cards without a border.',
  ),
  surface: token('#ffffff', 'سطح', 'Cards, panels, fields and the sidebar.'),
  sunken: token(
    '#e6e8f3',
    'سطح غائر',
    'Hover fill of quiet controls and nav items; the fill of placeholders.',
  ),
  line: token('#d6d9e8', 'حد', 'Structural dividers: sidebar edge, card section heads.'),
  lineSoft: token(
    '#e8eaf3',
    'حد خافت',
    'Card edge and row separators. Close to the canvas so it is felt, not seen.',
  ),
  fieldLine: token('#8b90b0', 'حد الحقل', 'Resting border of inputs, selects and textareas.'),
  ink: token('#171a56', 'الحبر', 'Primary text and headings; the fill of primary actions.'),
  inkHover: token('#2b2f6e', 'الحبر عند التمرير', 'Hover fill of ink-filled actions.'),
  inkSoft: token('#454a78', 'نص ثانوي', 'Secondary labels, descriptions and nav items at rest.'),
  muted: token(
    '#5f6389',
    'نص خافت',
    'Metadata, hints and table headers. Passes 4.5:1 on canvas and surface.',
  ),
  faint: token(
    '#7a7ea3',
    'نص باهت',
    'Placeholders and decorative counts only; not for text that must be read.',
  ),
  onInk: token(
    '#ffffff',
    'نص فوق الحبر',
    'Label colour on ink-filled actions and resolved badges.',
  ),
  focus: token('#171a56', 'حلقة التركيز', 'Keyboard focus ring on every control (2px, offset 2).'),
  scrim: token('rgb(13 15 46 / 55%)', 'غطاء', 'Backdrop behind dialogs and pickers.'),
} satisfies Record<string, ScaleToken>;

/** Feedback. Each state has a tint for chips and an ink that reads on it. */
export const studioFeedbackColor = {
  success: token('#1fa85d', 'نجاح', 'Success marks, the switch "on" track and progress fills.'),
  successInk: token('#14713e', 'نص النجاح', 'Success text; label of published and active chips.'),
  successTint: token('#dcf4e5', 'خلفية النجاح', 'Fill of published, active and new chips.'),
  warning: token('#c0892a', 'تنبيه', 'Warning marks and the pending-upload progress fill.'),
  warningInk: token('#78560e', 'نص التنبيه', 'Warning text; label of overdue and contacted chips.'),
  warningTint: token('#f8edcd', 'خلفية التنبيه', 'Fill of overdue and contacted chips.'),
  danger: token('#c22f2d', 'خطأ', 'Error text, invalid field borders and danger actions.'),
  dangerHover: token('#a82927', 'خطأ عند التمرير', 'Hover ink of danger actions.'),
  dangerInk: token('#8f2220', 'نص الخطأ على خلفيته', 'Label of canceled, rejected and spam chips.'),
  dangerTint: token(
    '#fbe4e3',
    'خلفية الخطأ',
    'Fill of canceled and rejected chips; hover fill of danger actions.',
  ),
} satisfies Record<string, ScaleToken>;

/**
 * Domain colours: every section of the Studio owns one hue, used tonally
 * (a tint behind, a dark ink on it, one mid tone for marks). The eight hues
 * share one lightness and saturation so they read as one set. They sign the
 * sidebar, page heads, overview cards and status chips; they never fill a
 * button.
 */
export const studioDomainColor = {
  episodesTint: token('#e6e8f8', 'الحلقات: خلفية', 'Behind episode counts and scheduled chips.'),
  episodesTone: token('#4453b8', 'الحلقات: لون', 'The episodes mark in the sidebar and page head.'),
  episodesInk: token(
    '#2c3590',
    'الحلقات: نص',
    'Text on the episodes tint; label of scheduled chips.',
  ),
  showsTint: token('#dcefed', 'البرامج: خلفية', 'Behind programme counts.'),
  showsTone: token('#1e8c86', 'البرامج: لون', 'The programmes mark.'),
  showsInk: token('#0f5f5a', 'البرامج: نص', 'Text on the programmes tint.'),
  guestsTint: token('#fbe8de', 'الضيوف: خلفية', 'Behind guest counts.'),
  guestsTone: token('#c86a3b', 'الضيوف: لون', 'The guests mark.'),
  guestsInk: token('#8c431f', 'الضيوف: نص', 'Text on the guests tint.'),
  articlesTint: token('#f9e4ea', 'المقالات: خلفية', 'Behind article counts.'),
  articlesTone: token('#ad4262', 'المقالات: لون', 'The articles mark.'),
  articlesInk: token('#7c2b45', 'المقالات: نص', 'Text on the articles tint.'),
  audienceTint: token('#e9f0d8', 'الجمهور: خلفية', 'Behind subscriber and newsletter counts.'),
  audienceTone: token('#6e8c25', 'الجمهور: لون', 'The subscribers and newsletter mark.'),
  audienceInk: token('#475f14', 'الجمهور: نص', 'Text on the audience tint.'),
  formsTint: token('#f8edcd', 'الطلبات: خلفية', 'Behind request counts.'),
  formsTone: token('#b9861d', 'الطلبات: لون', 'The requests and forms mark.'),
  formsInk: token('#78560e', 'الطلبات: نص', 'Text on the requests tint.'),
  accessTint: token(
    '#e4e8ef',
    'الوصول: خلفية',
    'Behind role and member counts; fill of draft chips.',
  ),
  accessTone: token('#5d6d85', 'الوصول: لون', 'The roles and members mark.'),
  accessInk: token('#3a4658', 'الوصول: نص', 'Text on the access tint; label of draft chips.'),
  academyTint: token('#dcf4e5', 'الأكاديمية: خلفية', 'Behind course counts.'),
  academyTone: token('#1fa85d', 'الأكاديمية: لون', 'The academy mark (the brand green, deepened).'),
  academyInk: token('#14713e', 'الأكاديمية: نص', 'Text on the academy tint.'),
} satisfies Record<string, ScaleToken>;

/** The Studio domains, in sidebar order, with the token stem each one uses. */
export const studioDomains = [
  'episodes',
  'shows',
  'guests',
  'articles',
  'academy',
  'audience',
  'forms',
  'access',
] as const;
export type StudioDomain = (typeof studioDomains)[number];

export const studioFont = {
  family: {
    value: "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
    label: 'IBM Plex Sans Arabic',
    role: 'The only family, self-hosted from /fonts in weights 400, 500 and 700.',
  },
} satisfies Record<string, ScaleToken>;

export const studioWeight = {
  regular: token('400', 'عادي', 'Running text and resting nav items.'),
  medium: token('500', 'متوسط', 'Labels, chips, quiet actions, active nav items.'),
  semibold: token('600', 'شبه عريض', 'Identity lines and emphasised values.'),
  bold: token('700', 'عريض', 'Page and section headings, stat values.'),
} satisfies Record<string, ScaleToken>;

export const studioText = {
  '2xs': token('12px', 'تعليق', 'Metadata, chips, table headers, hints.'),
  xs: token('13px', 'بيانات', 'Quiet actions, nav account links, filter rail, field labels.'),
  sm: token('14px', 'واجهة', 'Nav items, body copy in panels, definition values.'),
  md: token('15px', 'واجهة كبيرة', 'The document default and primary action labels.'),
  base: token('16px', 'نص أساسي', 'Section headings inside detail panels.'),
  lg: token('17px', 'عنوان صغير', 'Row titles and card section headings.'),
  xl: token('18px', 'عنوان لوحة', 'Panel headings.'),
  '2xl': token('20px', 'عنوان فرعي', 'Sub-headings in editors.'),
  '3xl': token('24px', 'عنوان صفحة صغير', 'Auth panel headings; page titles on phones.'),
  '4xl': token('26px', 'عنوان صفحة مدمج', 'Page titles on tablets.'),
  '5xl': token('30px', 'عنوان صفحة', 'Page titles.'),
  display: token('36px', 'رقم إحصائي', 'Overview stat values.'),
} satisfies Record<string, ScaleToken>;

export const studioLeading = {
  tight: token('1.3', 'متقارب', 'Stat values.'),
  heading: token('1.45', 'عناوين', 'Headings.'),
  ui: token('1.5', 'واجهة', 'Controls, chips and nav items.'),
  body: token('1.6', 'نص', 'The document default.'),
  reading: token('1.75', 'قراءة', 'Descriptions and definition values.'),
} satisfies Record<string, ScaleToken>;

export const studioSpace = {
  '4': token('4px', '٤', 'Hairline gaps inside compact controls.'),
  '8': token('8px', '٨', 'Icon-to-label gaps, row action gaps, nav gaps.'),
  '12': token('12px', '١٢', 'Control padding, small stacks.'),
  '16': token('16px', '١٦', 'Default stack and grid gap.'),
  '20': token('20px', '٢٠', 'Compact card padding.'),
  '24': token('24px', '٢٤', 'Card padding and section internals.'),
  '28': token('28px', '٢٨', 'Sidebar top padding, between nav groups.'),
  '32': token('32px', '٣٢', 'Between blocks inside a page.'),
  '40': token('40px', '٤٠', 'Main column top padding.'),
  '48': token('48px', '٤٨', 'Main column side padding; empty-state padding.'),
  '64': token('64px', '٦٤', 'Main column bottom padding.'),
} satisfies Record<string, ScaleToken>;

export const studioRadius = {
  card: token('14px', 'زاوية البطاقة', 'Cards and panels.'),
  panel: token('12px', 'زاوية اللوحة', 'Inset panels and notices inside cards.'),
  control: token('8px', 'زاوية الحقل', 'Buttons, fields, nav items and filter items.'),
  chip: token('6px', 'زاوية الشارة', 'Status chips and small marks.'),
  pill: token('999px', 'كبسولة', 'Switch tracks and progress bars.'),
  round: token('50%', 'دائرة', 'Avatars, photos and spinners.'),
} satisfies Record<string, ScaleToken>;

export const studioLayout = {
  sidebar: token('240px', 'عرض الشريط الجانبي', 'Sidebar width on desktop.'),
  sidebarCompact: token('208px', 'الشريط الجانبي المدمج', 'Sidebar width under 1180px.'),
  sidebarWide: token('252px', 'الشريط الجانبي العريض', 'Sidebar width from 1600px.'),
  content: token('1080px', 'عرض المحتوى', 'Maximum content width.'),
  contentWide: token('1120px', 'عرض المحتوى العريض', 'Maximum content width from 1600px.'),
} satisfies Record<string, ScaleToken>;

export const studioMotion = {
  fast: token('140ms', 'سريعة', 'Colour and fill state changes on controls.'),
} satisfies Record<string, ScaleToken>;

/** Canonical @media widths for the Studio; enforced by `pnpm design:check`. */
export const studioBreakpoints = {
  phone: token('600px', 'هاتف', 'max-width: phones; single-column grids.'),
  tablet: token('900px', 'لوحي', 'max-width: the sidebar becomes a top bar with a menu.'),
  laptop: token('1180px', 'حاسوب', 'max-width: compact sidebar; 44px controls.'),
  wide: token('1600px', 'شاشة عريضة', 'min-width: wider sidebar and content column.'),
} satisfies Record<string, ScaleToken>;
