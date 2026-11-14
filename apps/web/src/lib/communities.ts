/**
 * Communities, programmes, presenters and newsletters, with the copy approved in
 * Abdulrahman Othman's brief «موقع مختلف | هيكل الصفحات والمحتوى المعتمد»
 * (9 November 2026, sections 6, 10, 13, 23 and 24).
 *
 * Only approved text lives here. A presenter whose name or bio is still being
 * confirmed is left out, never shown with a placeholder. Logos and covers are
 * copies of the published images (scripts/fetch-community-art.mjs).
 */

export interface Programme {
  slug: string;
  name: string;
  description: string;
  /** Presenter slugs, in the order the brief lists them. Empty while unconfirmed. */
  presenters: string[];
  /** YouTube playlist id. */
  playlist: string;
  /** Slug of the programme page on this site, when its episodes are in the catalogue. */
  showSlug?: string;
}

export interface Community {
  slug: string;
  name: string;
  description: string;
  youtube: string;
  programmes: Programme[];
}

export interface Presenter {
  slug: string;
  name: string;
  bio: string;
  /** For «تعرّف عليها» and «برامجها». */
  feminine?: boolean;
}

export interface Newsletter {
  slug: string;
  name: string;
  description: string;
  frequency?: string;
  /** The subscription page in use today. */
  subscribeUrl: string;
}

const p = (
  slug: string,
  name: string,
  description: string,
  playlist: string,
  presenters: string[] = [],
  showSlug?: string,
): Programme => ({ slug, name, description, playlist, presenters, showSlug });

export const COMMUNITIES: Community[] = [
  {
    slug: 'idhaa',
    name: 'إذاعة مختلف',
    description: 'تجارب وحوارات عن العمل والحياة، والقرارات التي تشكّل مساراتنا.',
    youtube: 'https://www.youtube.com/@Mukhtalif_Career',
    programmes: [
      p(
        'shaqla',
        'شغلة',
        'خفايا المهن وتفاصيل يومها، يرويها أصحابها من واقع تجاربهم.',
        'PLRJcweuRKcSOGR6AbTzkKxZB1bnMjCJi_',
        ['saleh-alaufi'],
        'shaqla',
      ),
      p(
        'petroly',
        'بترولي',
        'حوارات عن المسارات المهنية، والقرارات والتحديات التي شكّلت تجارب أصحابها.',
        'PLRJcweuRKcSNLQvq3g1guO92LVLyXxUOM',
        ['ahmed-attar'],
        'petroly',
      ),
      p(
        'munagasha',
        'مناقشة',
        'نقرّب التخصصات الأكاديمية من واقع العمل، ونناقش كيف نستخدم ما نتعلّمه.',
        'PLRJcweuRKcSMPK7Ray3zelvGq5dQREqXy',
        [],
        'munagasha',
      ),
      p(
        'munawib',
        'مناوب',
        'كواليس العمل في القطاع الصحي، وتجارب العاملين فيه وتقاطعه مع حياتنا.',
        'PLRJcweuRKcSPrhhvWuKaobWwelwW7lrlk',
        ['adel-radwan'],
        'munawib',
      ),
      p(
        'gilaf',
        'غلاف',
        'نناقش أفكار الكتب المهنية، ونربطها بواقعنا وما نواجهه في العمل والحياة.',
        'PLRJcweuRKcSMcuYa508WJvxTbsRZqy3dM',
        ['riyadh-alshehri'],
        'gilaf',
      ),
      p(
        'awalim',
        'عوالم',
        'رحلات وتجارب من حول العالم، تقرّبنا من الناس وثقافاتهم وطرق عيشهم.',
        'PLRJcweuRKcSOQYEV2egy6v10_hIIUjGhV',
        [],
        'awalim',
      ),
      p(
        'bokra',
        'بكرة',
        'حوارات عن المستقبل، والتغيّرات التقنية والاقتصادية والاجتماعية التي تشكّل حياتنا.',
        'PLRJcweuRKcSOuv_Ob6yzTRacNBH3bAKpf',
        ['ali-alazazi'],
        'bokra',
      ),
      p(
        'arwiqah',
        'أروقة',
        'مهارات تحتاجها في سوق العمل، نناقشها مع أصحاب الخبرة لتطوّر مسارك المهني.',
        'PLRJcweuRKcSPmQ8udaH-uCaQL1IC2rhfq',
        ['salman-khayyat'],
        'arwiqah',
      ),
      p(
        'seera',
        'سيرة',
        'نقرأ المسارات المهنية لشخصيات تركت أثرًا، ونتتبّع قراراتها ونجاحاتها وتعثراتها.',
        'PLRJcweuRKcSMsTbkcLfLu1539YRB5kUR-',
        [],
        'seera',
      ),
    ],
  },
  {
    slug: 'riyadi',
    name: 'ريادي مختلف',
    description: 'من الفكرة إلى السوق؛ تجارب تأسيس المشاريع وإدارتها وتنميتها.',
    youtube: 'https://www.youtube.com/@Riyadi_Mukhtalif',
    programmes: [
      p(
        'unicorn',
        'يونيكورن',
        'قرارات تأسيس الشركات وإدارتها وتمويلها، وما تكشفه تجارب النمو والتعثر.',
        'PLT7JvkOHJK_P8tL4xLPYzrs6P2mkulwQG',
        ['mohammed-alnoaman', 'mohammed-othman'],
      ),
      p(
        'deal',
        'ديل',
        'تجارب التجارة الإلكترونية، من تأسيس المتجر إلى تشغيله وتنميته ومواجهة تحديات السوق.',
        'PLT7JvkOHJK_Ofttt-To72hzv937u6UqHu',
        ['hatem-almansour'],
      ),
      p(
        'wakala',
        'وكالة',
        'كواليس التسويق والإعلان، من تطوير الفكرة إلى إدارة الوكالات وتنفيذ الحملات.',
        'PLT7JvkOHJK_MzrOFcw6lXKGYvo9lTvbxg',
        ['murtada-bin-saleh'],
      ),
      p(
        'khuzama',
        'خزامى',
        'تجارب من السياحة والضيافة، تكشف كيف تُبنى الوجهات والمشروعات وتجارب الزوار.',
        'PLCny2dQQYdDg',
        ['abdullah-alzahrani'],
      ),
      p(
        'menu',
        'منيو',
        'تجارب تأسيس المطاعم وإدارتها، وقرارات التشغيل والتمويل والتوسع.',
        'PLBVu9Ks3sVNE',
      ),
      p(
        'fintech525',
        'Fintech525',
        'حوارات مع العاملين في التقنية المالية عن المنتجات والتمويل والتنظيم وتحديات القطاع.',
        'PLQdipFk8Q11A',
      ),
      p(
        'nitaq',
        'نطاق',
        'حوارات عن تطوير العمل الخيري، واستخدام التقنية والذكاء الاصطناعي في خدمته.',
        'PLd33IutakM4A',
      ),
    ],
  },
  {
    slug: 'tayyar',
    name: 'طيار مختلف',
    description: 'عالم الطيران من الداخل؛ أخباره، ومهنه، وتقنياته، والقصص خلف رحلاته.',
    youtube: 'https://www.youtube.com/@Tayyar_Mukhtalif',
    programmes: [
      p(
        'amyal',
        'أميال',
        'أخبار الطيران وقصصه، نناقشها مع أهل المجال لفهم ما يحدث خلف الرحلات.',
        'PL-28-P9s2PZc4QiX00CZ6kzoKOmJNWVc8',
        ['mohammed-bazaid', 'rakan-alobaid'],
      ),
    ],
  },
  {
    slug: 'jinai',
    name: 'جنائي مختلف',
    description: 'قصص الجريمة وكواليس التحقيق، لفهم الدوافع وتتبع الأدلة.',
    youtube: 'https://www.youtube.com/@Jinai_Mukhtalif',
    programmes: [
      p(
        'qadiyah',
        'قضية',
        'قضايا وظواهر أمنية واجتماعية، نناقش تفاصيلها مع المختصين لفهم أسبابها وآثارها.',
        'PLtjzb52dT4MJjlIES9HMoj9L-qxidAger',
        ['mohammed-alshaibani'],
        'qadiyah',
      ),
      p(
        'qatim',
        'قاتم',
        'قصص وشخصيات وأحداث، نتتبّع تفاصيلها والجوانب القاتمة في مساراتها.',
        'PLtjzb52dT4MIjlosk7s9yn1vNPBd8czZn',
        ['ibrahim-allami', 'osama-alghamdi'],
      ),
      p(
        'tashreeh',
        'تشريح',
        'نناقش الطب الشرعي وما يكشفه عن الجسد والموت والسلوك الإنساني.',
        'PLWS3NI6KVLHk',
      ),
    ],
  },
  {
    slug: 'nafsi',
    name: 'نفسي مختلف',
    description: 'حوارات تساعدنا على فهم أنفسنا وعلاقاتنا وتجاربنا النفسية.',
    youtube: 'https://www.youtube.com/@Nafsi_Mukhtalif',
    programmes: [
      p(
        'anfus',
        'أنفس',
        'حوارات عن الصحة النفسية واضطراباتها، وتأثير تجاربنا وعلاقاتنا في حياتنا.',
        'PLGJmko3NLK9E',
      ),
    ],
  },
  {
    slug: 'tarbawi',
    name: 'تربوي مختلف',
    description: 'أسئلة التربية والتعليم، وتجارب من يرافقون الطفل في نموّه.',
    youtube: 'https://www.youtube.com/@Tarbawi_Mukhtalif',
    programmes: [],
  },
  {
    slug: 'thakali',
    name: 'ذكالي مختلف',
    description: 'الذكاء الاصطناعي وتطبيقاته، وكيف يغيّر عملنا وحياتنا.',
    youtube: 'https://www.youtube.com/@Thakali_Mukhtalif',
    programmes: [
      p(
        'majlis-raim',
        'مجلس رايم',
        'نناقش تطبيقات الذكاء الاصطناعي، وتجارب بناء الشركات والمنتجات التقنية.',
        'PLAbtAhwczLSQ',
      ),
    ],
  },
  {
    slug: 'comedian',
    name: 'كوميديان مختلف',
    description: 'صناعة الضحك وتجارب أهلها، من كتابة الفكرة إلى تقديمها للجمهور.',
    youtube: 'https://www.youtube.com/@comedian_mukhtalif',
    programmes: [
      p(
        'mafi-shay-yidahhik',
        'مافي شي يضحّك',
        'دلال القحطاني تحاور صنّاع الكوميديا عن الكتابة والستاند أب وعلاقتهم بالجمهور.',
        'PLlY6ueCModR8lLS_zlIEqIX51jvybg2Ag',
        ['dalal-alqahtani'],
      ),
    ],
  },
  {
    slug: 'mohandis',
    name: 'مهندس مختلف',
    description: 'الهندسة خلف المشاريع؛ تجارب أهلها وتحديات التصميم والتنفيذ.',
    youtube: 'https://www.youtube.com/@mohandis_mukhtalif',
    programmes: [
      p(
        'dynamica',
        'ديناميكا',
        'تجارب هندسية من الممارسة اليومية، تشرح الأنظمة وقرارات التصميم والصيانة والتنفيذ.',
        'PLCw5OYAnbZ9wOI9sL24kTrBPEhvnjXUr6',
        ['ahmed-habaja'],
      ),
      p(
        'salasil',
        'سلاسل',
        'سلاسل الإمداد والمشتريات من واقع الممارسة، من المصانع والمستودعات إلى الموانئ والأسواق.',
        'PLCw5OYAnbZ9xW1AU-bWP8q38Ii8oaT8F1',
        ['abdullah-amin'],
      ),
      p(
        'handas',
        'هنداس',
        'حوارات مع مهندسين عن تخصصاتهم وتجاربهم، من العمارة إلى الشبكات ومراكز البيانات.',
        'PLCw5OYAnbZ9xPoYTyaSDYh9yFNQWf7aFQ',
        ['abdulrahman-alamri'],
      ),
      p(
        'muqawil',
        'مقاول',
        'كواليس تنفيذ المشاريع، من اختيار المقاول والتعاقد إلى متابعة العمل والتسليم.',
        'PLdL61_6LWcfA',
      ),
    ],
  },
];

/** Section 13: every presenter with an approved bio. Order follows the brief. */
export const PRESENTERS: Presenter[] = [
  {
    slug: 'ahmed-attar',
    name: 'أحمد عطار',
    bio: 'مختص في المحتوى والعلامة الشخصية، ومقدّم برنامج بترولي. يحاور ضيوفه عن تجاربهم المهنية والقرارات التي شكّلت مساراتهم.',
  },
  {
    slug: 'riyadh-alshehri',
    name: 'رياض الشهري',
    bio: 'مستشار مالي ومقدّم برنامج غلاف. يناقش مع ضيوفه أفكار الكتب، ويربطها بقراراتنا وتجاربنا في العمل والحياة.',
  },
  {
    slug: 'salman-khayyat',
    name: 'سلمان خيّاط',
    bio: 'مقدّم برنامج أروقة، وخريج كلية الأعمال بجامعة الملك فهد للبترول والمعادن. يحاور أصحاب الخبرة عن المهارات التي تساعد على تطوير المسار المهني.',
  },
  {
    slug: 'ali-alazazi',
    name: 'علي العزازي',
    bio: 'مقدّم برنامج بكرة. يناقش مع ضيوفه التحولات التقنية والاقتصادية والاجتماعية وأثرها في مستقبل العمل والحياة.',
  },
  {
    slug: 'dalal-alqahtani',
    name: 'دلال القحطاني',
    bio: 'مقدّمة برنامج مافي شي يضحّك. تحاور صنّاع الكوميديا عن كتابة النكتة والستاند أب وتجاربهم مع الجمهور.',
    feminine: true,
  },
  {
    slug: 'murtada-bin-saleh',
    name: 'مرتضى بن صالح',
    bio: 'مقدّم برنامج وكالة. يناقش مع ضيوفه كواليس التسويق والإعلان والتواصل المؤسسي وتجارب العمل في القطاع.',
  },
  {
    slug: 'abdullah-alzahrani',
    name: 'م. عبدالله الزهراني',
    bio: 'مؤسس ومطوّر أعمال في قطاع السياحة والضيافة، ومقدّم برنامج خزامى. يحاور العاملين في القطاع عن التأجير اليومي وإدارة مرافق الضيافة وتجربة الضيف.',
  },
  {
    slug: 'mohammed-bazaid',
    name: 'محمد بازيد',
    bio: 'صانع محتوى من أوائل اليوتيوبرز في السعودية، وأحد مقدّمي برنامج أميال. يناقش أخبار الطيران وتحولات القطاع وأثرها في تجربة السفر.',
  },
  {
    slug: 'rakan-alobaid',
    name: 'الكابتن راكان العبيد',
    bio: 'كابتن طيران وأحد مقدّمي برنامج أميال. يشارك خبرته في مناقشة أخبار الطيران والتشغيل وتجربة السفر.',
  },
  {
    slug: 'adel-radwan',
    name: 'د. عادل رضوان',
    bio: 'مقدّم برنامج مناوب. يحاور العاملين في القطاع الصحي عن تجاربهم المهنية وكواليس تخصصاتهم.',
  },
  {
    slug: 'mohammed-alshaibani',
    name: 'محمد الشيباني',
    bio: 'محلل سلوك إجرامي وصانع محتوى، ومقدّم برنامج قضية. يناقش دوافع الجرائم وأنماط سلوك مرتكبيها، ويقرّب تفاصيل القضايا للجمهور.',
  },
  {
    slug: 'ibrahim-allami',
    name: 'إبراهيم اللامي',
    bio: 'كاتب ورسّام قصص مصوّرة ومحاضر في الخيال العلمي والقصص المصوّرة، وأحد مقدّمي برنامج قاتم.',
  },
  {
    slug: 'osama-alghamdi',
    name: 'أسامة الغامدي',
    bio: 'أحد مقدّمي برنامج قاتم. يشارك في رواية القصص ومناقشة تفاصيلها والقرارات التي غيّرت مسارات أصحابها.',
  },
  {
    slug: 'saleh-alaufi',
    name: 'صالح العوفي',
    bio: 'مقدّم برامج حوارية، قدّم «كيف بدأت؟» ويقدّم «شغلة». يحاور أصحاب المهن عن بداياتهم وتفاصيل عملهم وتجاربهم اليومية.',
  },
  {
    slug: 'hatem-almansour',
    name: 'حاتم المنصور',
    bio: 'مقدّم برنامج ديل. يحاور أصحاب المتاجر والمختصين عن تجارب التجارة الإلكترونية وتحديات التشغيل والنمو.',
  },
  {
    slug: 'ahmed-habaja',
    name: 'أحمد حباجة',
    bio: 'مقدّم برنامج ديناميكا. يحاور المهندسين عن تجاربهم وتخصصاتهم، ويقرّب تفاصيل الممارسة الهندسية للجمهور.',
  },
  {
    slug: 'abdullah-amin',
    name: 'م. عبدالله أمين',
    bio: 'مهندس ومقدّم برنامج سلاسل. يحاور المختصين عن سلاسل الإمداد والمشتريات، وتجارب التشغيل والتخطيط والتفاوض.',
  },
  {
    slug: 'abdulrahman-alamri',
    name: 'عبدالرحمن العمري',
    bio: 'يعمل في تشغيل مراكز البيانات وإدارة المرافق الحيوية، ومقدّم برنامج هنداس. يحاور المهندسين عن تخصصاتهم وتجاربهم وتطبيقات الهندسة.',
  },
  {
    slug: 'mohammed-alnoaman',
    name: 'محمد النعمان',
    bio: 'صاحب خبرة في قيادة الفرق التقنية، وأحد مقدّمي برنامج يونيكورن. يناقش بناء المنتجات والشركات التقنية وتحديات نموّها.',
  },
  {
    slug: 'mohammed-othman',
    name: 'محمد عثمان',
    bio: 'محلل استثمار وأحد مقدّمي برنامج يونيكورن. يناقش تمويل الشركات الناشئة وتقييمها وقرارات النمو والاستحواذ.',
  },
];

/** Section 10. Frequency is shown only where the brief states it. */
export const NEWSLETTERS: Newsletter[] = [
  {
    slug: 'petroly',
    name: 'بترولي',
    description:
      'تجارب ضيوف بترولي وأفكار حلقاته في نشرة أسبوعية، تقرّب لك القصص وتستخلص منها ما يفيدك في حياتك وعملك.',
    frequency: 'أسبوعية',
    subscribeUrl: 'https://mukhtalif.net/petrolynewsletter/',
  },
  {
    slug: 'amyal',
    name: 'أميال',
    description:
      'أخبار الطيران وتحليلاته وقصصه، مع نصائح للسفر، تصلك من الأحد إلى الخميس في نشرة مختصرة.',
    frequency: 'من الأحد إلى الخميس',
    subscribeUrl: 'https://mukhtalif.net/amyalnl/',
  },
  {
    slug: 'almukhtalifoon',
    name: 'المختلفون',
    description:
      'أفكار وتجارب عن العمل والحياة، تساعدك تفهم تحدياتك المهنية وتكتشف زوايا جديدة للتعامل معها، مع ترشيحات من محتوى مختلف.',
    subscribeUrl: 'https://mukhtalif.net/newsletter/',
  },
  {
    slug: 'arwiqah',
    name: 'أروقة',
    description: 'خبرات ومهارات من ضيوف أروقة، تساعدك على التقدم في عملك وحياتك المهنية.',
    subscribeUrl: 'https://mukhtalif.net/arwiqahnl/',
  },
];

export const communityLogo = (community: Pick<Community, 'slug'>) =>
  `/communities/${community.slug}.jpg`;
export const programmeCover = (programme: Pick<Programme, 'slug'>) =>
  `/communities/programmes/${programme.slug}.jpg`;
export const playlistUrl = (programme: Pick<Programme, 'playlist'>) =>
  `https://www.youtube.com/playlist?list=${programme.playlist}`;

/** Where a programme card leads: its page here, or its playlist on YouTube. */
export const programmeHref = (programme: Programme) =>
  programme.showSlug ? `/shows/${programme.showSlug}` : playlistUrl(programme);

export const findCommunity = (slug: string) => COMMUNITIES.find((c) => c.slug === slug);
export const findPresenter = (slug: string) => PRESENTERS.find((x) => x.slug === slug);

export function programmesOf(presenterSlug: string) {
  return COMMUNITIES.flatMap((community) =>
    community.programmes
      .filter((programme) => programme.presenters.includes(presenterSlug))
      .map((programme) => ({ community, programme })),
  );
}

export function communityOfShow(showSlug: string) {
  for (const community of COMMUNITIES) {
    const programme = community.programmes.find((x) => x.showSlug === showSlug);
    if (programme) return { community, programme };
  }
  return undefined;
}
