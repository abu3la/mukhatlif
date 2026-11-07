/**
 * Public website design tokens (apps/web): the single source of truth for the
 * site's colour, type, spacing, radius, layout and motion.
 *
 * Change a value here, then run `pnpm design:build`. That regenerates
 * `apps/web/src/app/tokens.css`, the palette block of the static error page
 * (`apps/web/public/error-state.css`) and `design-system/TOKENS.md`. Never edit
 * those outputs by hand; `pnpm design:check` fails when they drift.
 *
 * Appearances: `light` is the default (`data-concept="first"`); `dark` is the
 * warm green-black appearance (`data-concept="third"`). A token whose two
 * values are equal is emitted once.
 *
 * `label` is the Arabic name shown on the /design-system reference page.
 * `role` says where the token belongs; read it before choosing a token.
 */

export interface ThemedToken {
  light: string;
  dark: string;
  label: string;
  role: string;
}

export interface ScaleToken {
  value: string;
  label: string;
  role: string;
}

const same = (value: string, label: string, role: string): ThemedToken => ({
  light: value,
  dark: value,
  label,
  role,
});

/** Theme-aware roles. Components use these. */
export const webColor = {
  page: {
    light: '#ffffff',
    dark: '#1a1b19',
    label: 'أرضية الصفحة',
    role: 'Page ground behind all content. Also the browser theme-color.',
  },
  surface: {
    light: '#f4f5fa',
    dark: '#272925',
    label: 'سطح مرتفع',
    role: 'Panels, dialogs and the hover fill of quiet header controls.',
  },
  surfaceHover: {
    light: '#e9edf7',
    dark: '#353a32',
    label: 'سطح عند التمرير',
    role: 'Hover fill of controls that sit on `surface`.',
  },
  card: {
    light: '#e8ecf8',
    dark: '#2c302a',
    label: 'بطاقة محتوى',
    role: 'Fill of content cards: episodes, articles, account cards.',
  },
  ink: {
    light: '#171a56',
    dark: '#f5f6f3',
    label: 'الحبر',
    role: 'Primary text and headings; the fill of primary actions.',
  },
  inkHover: {
    light: '#383c75',
    dark: '#dce3d7',
    label: 'الحبر عند التمرير',
    role: 'Hover fill of ink-filled primary actions.',
  },
  inkMuted: {
    light: '#505568',
    dark: '#b8c0b7',
    label: 'نص ثانوي',
    role: 'Metadata, descriptions, hints and secondary labels.',
  },
  onInk: {
    light: '#ffffff',
    dark: '#1a1b19',
    label: 'نص فوق الحبر',
    role: 'Label and icon colour on ink-filled actions.',
  },
  border: {
    light: '#c7c9d7',
    dark: '#60675c',
    label: 'حد',
    role: 'Field borders and structural dividers.',
  },
  borderSoft: {
    light: '#e1e3ed',
    dark: '#41473e',
    label: 'حد خافت',
    role: 'Quiet separators between list rows.',
  },
  success: {
    light: '#14713e',
    dark: '#38df82',
    label: 'نجاح',
    role: 'Confirmation text after a completed action.',
  },
  danger: {
    light: '#c22f2d',
    dark: '#ff7775',
    label: 'خطأ',
    role: 'Error text and invalid field borders in public forms.',
  },
  dangerText: {
    light: '#c22f2d',
    dark: '#ff8583',
    label: 'خطأ في الحساب',
    role: 'Error text in account forms and danger rows. Same as `danger` in light; a slightly lighter red in dark (consolidation candidate, see DECISIONS.md).',
  },
  footer: {
    light: '#171a56',
    dark: '#10120f',
    label: 'أرضية التذييل',
    role: 'Footer floor; deliberately darker than the page in both appearances.',
  },
  footerInk: {
    light: '#ffffff',
    dark: '#f5f6f3',
    label: 'نص التذييل',
    role: 'Footer links, tagline and email.',
  },
  footerMuted: {
    light: '#c7c9df',
    dark: '#b8c0b7',
    label: 'نص التذييل الثانوي',
    role: 'Footer copyright and link hover.',
  },
} satisfies Record<string, ThemedToken>;

/** The station's own colours. Identical in both appearances. */
export const brandColor = {
  brandIndigo: same(
    '#171a56',
    'نيلي مختلف',
    'The logo ink. The light appearance builds its ink from it.',
  ),
  brandGreen: same(
    '#38df82',
    'أخضر البث',
    'On-air green. Reserved for playback: play buttons, progress, the dark-mode success tone. Never decoration.',
  ),
  brandGreenHover: same('#5ce69a', 'أخضر البث عند التمرير', 'Hover fill of green play buttons.'),
  brandGreenDeep: same(
    '#1fa85d',
    'أخضر عميق',
    'Green marks on light grounds where `brandGreen` lacks contrast.',
  ),
  brandGreenInk: same('#14713e', 'أخضر نصي', 'Green text on light grounds, e.g. premium labels.'),
} satisfies Record<string, ThemedToken>;

/**
 * The broadcast palette: the deep indigo world of the persistent player dock
 * and the older dark brand panels. Identical in both appearances, because the
 * player keeps its own surface whichever appearance the page uses.
 */
export const broadcastColor = {
  broadcastGround: same(
    '#0d0f2e',
    'أرضية البث',
    'Deepest broadcast ground; also the label colour on green play buttons.',
  ),
  broadcastSurface: same('#151845', 'سطح المشغّل', 'Player dock fill.'),
  broadcastRaised: same(
    '#1d2154',
    'زر المشغّل',
    'Secondary transport, tools and close buttons in the dock.',
  ),
  broadcastHover: same(
    '#262b73',
    'زر المشغّل عند التمرير',
    'Hover fill of dock buttons and the speed control.',
  ),
  broadcastLine: same('#2c3060', 'حد البث', 'Dock edge and broadcast-panel borders.'),
  broadcastLineStrong: same('#3a3f78', 'حد زر المشغّل', 'Border of dock buttons.'),
  broadcastLineHover: same(
    '#4a5090',
    'حد زر المشغّل عند التمرير',
    'Border of dock buttons on hover.',
  ),
  broadcastTrack: same('#454b8a', 'مسار التقدّم', 'Unplayed part of the playback timeline.'),
  broadcastInk: same('#eaebf6', 'نص البث', 'Primary text and icons on broadcast surfaces.'),
  broadcastInkSoft: same('#c4c7df', 'نص البث الهادئ', 'Legacy muted text alias (`--text-muted`).'),
  broadcastInkMuted: same(
    '#bfc3df',
    'نص البث الثانوي',
    'Show title, status and times in the dock.',
  ),
  broadcastInkFaint: same('#9fa3c8', 'نص البث الخافت', 'Faint labels and disabled dock controls.'),
  broadcastThumb: same('#ffffff', 'مقبض التقدّم', 'Fill of the playback slider thumb.'),
  broadcastDanger: same('#ffaaa9', 'خطأ على البث', 'Player error text.'),
  broadcastDangerLine: same(
    '#f3a8a4',
    'حد خطأ على البث',
    'Invalid field border on broadcast panels.',
  ),
  broadcastDangerText: same(
    '#f3b6b2',
    'نص خطأ على البث',
    'Field error and feedback text on broadcast panels.',
  ),
} satisfies Record<string, ThemedToken>;

/** Feedback and overlays. Identical in both appearances. */
export const utilityColor = {
  warning: same('#d08a2e', 'تنبيه', 'Warning state; not used as decoration.'),
  destructive: same(
    '#a82927',
    'إجراء حذف',
    'Fill of irreversible account actions (delete, clear).',
  ),
  destructiveHover: same('#85211f', 'إجراء حذف عند التمرير', 'Hover fill of destructive actions.'),
  onDestructive: same('#ffffff', 'نص فوق إجراء الحذف', 'Label colour on destructive actions.'),
  scrim: same('rgb(0 0 0 / 0.5)', 'غطاء النافذة', 'Backdrop behind account dialogs.'),
  scrimAccount: same(
    'rgb(0 0 0 / 0.55)',
    'غطاء نافذة الحساب',
    'Earlier account-dialog backdrop, overridden by `scrim` (consolidation candidate).',
  ),
  scrimMenu: same('rgb(13 15 46 / 55%)', 'غطاء القائمة', 'Backdrop behind the site menu dialog.'),
  videoLetterbox: same('#111111', 'خلفية الفيديو', 'Behind the YouTube frame while it loads.'),
} satisfies Record<string, ThemedToken>;

export const webColorGroups = {
  semantic: { label: 'ألوان الأدوار', tokens: webColor },
  brand: { label: 'ألوان الهوية', tokens: brandColor },
  broadcast: { label: 'عالم البث (المشغّل)', tokens: broadcastColor },
  utility: { label: 'تنبيهات وأغطية', tokens: utilityColor },
} as const;

export const webFont = {
  family: {
    value: 'Mukhtalif, system-ui, sans-serif',
    label: 'IBM Plex Sans Arabic',
    role: 'The only family. Self-hosted from /handoff/fonts under the name "Mukhtalif". Never add a second face.',
  },
} satisfies Record<string, ScaleToken>;

export const webWeight = {
  regular: { value: '400', label: 'عادي', role: 'Running text.' },
  medium: { value: '500', label: 'متوسط', role: 'UI labels, navigation, captions.' },
  semibold: { value: '600', label: 'شبه عريض', role: 'Card titles and primary action labels.' },
  bold: { value: '700', label: 'عريض', role: 'Page and section headings.' },
} satisfies Record<string, ScaleToken>;

/** Type scale. Display headings use per-page `clamp()` values (see TOKENS.md). */
export const webText = {
  '2xs': { value: '12px', label: 'تعليق', role: 'Captions, copyright, progress labels.' },
  xs: { value: '13px', label: 'بيانات', role: 'Metadata, helper text, small labels.' },
  sm: { value: '14px', label: 'واجهة', role: 'UI text: navigation, buttons, card descriptions.' },
  md: { value: '15px', label: 'واجهة كبيرة', role: 'Footer tagline, larger UI labels.' },
  base: { value: '16px', label: 'نص أساسي', role: 'Body text. The document default.' },
  lg: { value: '17px', label: 'مقدمة', role: 'Leads and show-card captions.' },
  xl: { value: '18px', label: 'عنوان صغير', role: 'Small titles.' },
  '2xl': { value: '20px', label: 'عنوان بطاقة', role: 'Card titles.' },
  '3xl': { value: '24px', label: 'عنوان قسم', role: 'Section and dialog headings.' },
  '4xl': { value: '26px', label: 'عنوان قسم كبير', role: 'Larger section headings.' },
  '5xl': { value: '30px', label: 'عنوان صفحة صغير', role: 'Compact page headings.' },
} satisfies Record<string, ScaleToken>;

export const webLeading = {
  tight: { value: '1.3', label: 'متقارب', role: 'Large display numbers and compact headings.' },
  heading: { value: '1.5', label: 'عناوين', role: 'Headings (the handoff default for h1 to h3).' },
  ui: { value: '1.6', label: 'واجهة', role: 'Card titles and UI blocks.' },
  body: { value: '1.8', label: 'نص', role: 'Descriptions and running text.' },
  reading: { value: '1.9', label: 'قراءة', role: 'Long-form reading and article bodies.' },
} satisfies Record<string, ScaleToken>;

/** Spacing ruler. Names are the pixel value; choose a step, do not invent one. */
export const webSpace = {
  '4': { value: '4px', label: '٤', role: 'Hairline gaps inside compact controls.' },
  '8': { value: '8px', label: '٨', role: 'Icon-to-label gaps, tight stacks.' },
  '12': { value: '12px', label: '١٢', role: 'Field internals, small stacks.' },
  '16': { value: '16px', label: '١٦', role: 'Default stack and grid gap.' },
  '20': { value: '20px', label: '٢٠', role: 'Card rails, dialog heads.' },
  '24': { value: '24px', label: '٢٤', role: 'Card padding, section internals.' },
  '32': { value: '32px', label: '٣٢', role: 'Between blocks inside a section.' },
  '40': { value: '40px', label: '٤٠', role: 'Footer and section padding.' },
  '48': { value: '48px', label: '٤٨', role: 'Between sections on small screens.' },
  '64': { value: '64px', label: '٦٤', role: 'Between sections.' },
  '96': { value: '96px', label: '٩٦', role: 'Large page breaks.' },
} satisfies Record<string, ScaleToken>;

export const webRadius = {
  card: {
    light: '6px',
    dark: '12px',
    label: 'زاوية البطاقة',
    role: 'Cards, panels, embeds. Softer in the dark appearance by design.',
  },
  control: same('8px', 'زاوية الحقل', 'Inputs, selects and dialog fields.'),
  media: same('10px', 'زاوية الصورة', 'Images inside cards.'),
  dialog: same('16px', 'زاوية النافذة', 'Account dialogs.'),
  pill: same('999px', 'كبسولة', 'Primary actions and filter choices.'),
  round: same('50%', 'دائرة', 'Round icon buttons, portraits and marks.'),
} satisfies Record<string, ThemedToken>;

export const webLayout = {
  gutter: {
    light: 'clamp(20px, 4.5vw, 78px)',
    dark: 'clamp(20px, 5.5vw, 90px)',
    label: 'الهامش الجانبي',
    role: 'Page side gutter. Wider in the dark appearance by design.',
  },
  measure: same('1500px', 'عرض المحتوى', 'Maximum content width.'),
  measureEpisode: same('840px', 'عرض صفحة الحلقة', 'Episode detail column.'),
  measureArticle: same('760px', 'عرض المقال', 'Article reading column.'),
} satisfies Record<string, ThemedToken>;

export const webMotion = {
  fast: { value: '140ms', label: 'سريعة', role: 'Colour and fill state changes on controls.' },
  base: { value: '160ms', label: 'عادية', role: 'Larger state changes.' },
} satisfies Record<string, ScaleToken>;

/**
 * Canonical @media widths. Custom properties cannot be used inside media
 * queries, so these are documented and enforced by `pnpm design:check`.
 */
export const webBreakpoints = {
  phone: { value: '600px', label: 'هاتف', role: 'max-width: phones.' },
  tablet: { value: '820px', label: 'لوحي', role: 'max-width: small tablets.' },
  compact: {
    value: '1000px',
    label: 'شاشة مدمجة',
    role: 'max-width: the header collapses into the menu.',
  },
  laptop: { value: '1180px', label: 'حاسوب', role: 'max-width: compact desktop header.' },
  wide: { value: '1920px', label: 'شاشة عريضة', role: 'min-width: very wide screens.' },
} satisfies Record<string, ScaleToken>;

/** Values JavaScript needs (meta theme-color, inline styles). */
export const webThemeColor = { light: webColor.page.light, dark: webColor.page.dark } as const;
