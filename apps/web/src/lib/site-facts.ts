/**
 * Approved facts and copy that more than one page shows: the about page's
 * team, mission and story, and the services page's production formats. The
 * home page (D-24) retells them; edit them here, never in a page.
 */

/** «من وراء مختلف», in the order of the about page. */
export const TEAM = [
  ['محمد بازيد', 'رئيس مجلس الإدارة'],
  ['أحمد عطار', 'المدير التنفيذي'],
  ['عماد ناجي', 'المدير الإداري'],
  ['محمد نعمان غريواتي', 'مدير العمليات'],
  ['محمد عبدالعزيز', 'مدير المحتوى'],
  ['عبدالرحمن عثمان', 'مدير التسويق'],
  ['علاء الدين عثمان', 'مسؤول المنصات'],
  ['عبدالرحمن معشي', 'معد البرامج'],
  ['أحمد نور', 'محرر الفيديوهات القصيرة'],
] as const;

/** The production formats of the services page, with the form's own values. */
export const SERVICES = [
  ['بودكاست', 'تطوير فكرة البرنامج، محاوره وصوته، ثم تصور التسجيل والمونتاج.'],
  ['سلسلة مرئية', 'تصور لحلقات مترابطة، معالجة تحريرية، وإطار موحّد للتصوير.'],
  ['قصة علامة', 'تحديد الرسالة والجمهور، وتطوير معالجة لفيلم قصير.'],
] as const;

/** «قضيتنا» from the about page, split where the home lights it phrase by phrase. */
export const MANIFESTO = [
  'نقضي جزءًا كبيرًا من حياتنا في العمل،',
  'وتنعكس تجاربنا فيه على حياتنا خارجه.',
  'لذلك نهتم بالمهن والناس الذين يمارسونها؛',
  'بأسئلتهم، وتحدياتهم،',
  'والقرارات التي تشكّل مساراتهم.',
] as const;

export interface StoryStop {
  year: string;
  when: string;
  text: string;
  /** Programme slugs whose covers sit on the stop. */
  programmes?: readonly string[];
}

/** «قصتنا» from the about page, as stops on the home's path. */
export const STORY: readonly StoryStop[] = [
  { year: '2023', when: 'أكتوبر', text: 'بدأت قصة مختلف.' },
  {
    year: '2024',
    when: '14 أبريل',
    text: 'انطلقنا رسميًا مع بترولي، ثم شغلة وغلاف، وبعدهما بارتشن.',
    programmes: ['petroly', 'shaqla', 'gilaf'],
  },
  { year: '2025', when: 'جدة', text: 'استوديو ثانٍ في جدة، بعد استوديو الرياض.' },
  {
    year: 'اليوم',
    when: 'تسعة مجتمعات',
    text: 'أكثر من 30 برنامج بودكاست، ومعها نشرات ومقالات وورش تعليمية.',
  },
];

/** The home's programme rail: programmes with a confirmed presenter first. */
export const FEATURED_PROGRAMMES = [
  'petroly',
  'shaqla',
  'munawib',
  'gilaf',
  'bokra',
  'arwiqah',
  'qadiyah',
  'amyal',
  'mafi-shay-yidahhik',
  'wakala',
  'khuzama',
  'seera',
] as const;

/** Where Mukhtalif can be heard outside the site. */
export const PLATFORMS = [
  {
    id: 'youtube',
    label: 'YouTube',
    context: 'قناة مختلف',
    href: 'https://www.youtube.com/@mukhtalif_career',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    context: 'بودكاست بترولي',
    href: 'https://open.spotify.com/show/6m9xb0r6xCBtTvq4UnnYbh',
  },
  {
    id: 'apple-podcasts',
    label: 'Apple Podcasts',
    context: 'بودكاست بترولي',
    href: 'https://podcasts.apple.com/sa/podcast/id1532674246',
  },
] as const;
