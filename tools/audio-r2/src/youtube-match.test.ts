import { describe, expect, it } from 'vitest';
import { buildMatches, matchEpisode } from './youtube-match.ts';
import { videoLinkState } from './youtube-apply.ts';
import { channelAllowedForShow, OFFICIAL_CHANNELS } from './youtube-channels.ts';

const episode = {
  id: 'ep-1',
  guid: 'guid-1',
  title: 'كيف تبني علامتك الشخصية على لينكدإن وتصنع فرصك',
  durationSec: 3184,
  publishedAt: '2026-08-31T16:58:28.000Z',
  episodeType: 'full',
};
const video = {
  id: 'LyxZez5Nixk',
  title: `${episode.title} | بودكاست أروقة`,
  duration: 3180,
  channel_id: 'UC8vdjzu_0QMQlG9qNT5D_AQ',
  availability: 'public',
};
const show = { id: 'shw-arwiqah', slug: 'arwiqah', title: 'أروقة', episodes: [episode] };

describe('evidence-based episode video matching', () => {
  it('pins publisher extensions to reviewed shows and the historical KFUPM period', () => {
    const scope = [
      ['riyadi', 'seera'],
      ['riyadi', 'bokra'],
      ['stage', 'arwiqah'],
      ['programs', 'seera'],
      ['programs', 'qadiyah'],
    ] as const;
    for (const [channel, slug] of scope) {
      expect(channelAllowedForShow(OFFICIAL_CHANNELS[channel], slug)).toBe(true);
      expect(channelAllowedForShow(OFFICIAL_CHANNELS[channel], 'unrelated')).toBe(false);
    }
    expect(channelAllowedForShow(OFFICIAL_CHANNELS.kfupm, 'petroly', '2021-04-25')).toBe(true);
    for (const date of [undefined, 'bad-date', '2022-01-01', '2026-04-25'])
      expect(channelAllowedForShow(OFFICIAL_CHANNELS.kfupm, 'petroly', date)).toBe(false);
    expect(channelAllowedForShow(OFFICIAL_CHANNELS.kfupm, 'qadiyah', '2021-04-25')).toBe(false);
  });
  it('limits the verified Jinai channel to Qadiyah, without weakening other guards', () => {
    const jinai = { ...video, channel_id: 'UCbbF1sfUu2LV2vCads1eqiw' };
    const qadiyah = { ...show, id: 'shw-qadiyah', slug: 'qadiyah' };
    expect(buildMatches([qadiyah], [jinai])[0]!.videoId).toBe(video.id);
    expect(buildMatches([show], [jinai])[0]!.videoId).toBeNull();
    expect(matchEpisode(episode, [jinai]).videoId).toBeNull();
    for (const patch of [{ availability: 'private' }, { duration: 30 }, { channel_id: 'other' }])
      expect(buildMatches([qadiyah], [{ ...jinai, ...patch }])[0]!.videoId).toBeNull();
  });
  it('requires unique exact title and compatible duration', () => {
    expect(matchEpisode(episode, [video]).videoId).toBe(video.id);
    expect(matchEpisode(episode, [{ ...video, duration: 30 }]).videoId).toBeNull();
    expect(matchEpisode(episode, [{ ...video, duration: undefined }]).videoId).toBeNull();
    expect(matchEpisode(episode, [video, { ...video, id: 'M7YKLiadjIE' }]).videoId).toBeNull();
  });
  it('does not turn fuzzy candidates or trailers into automatic links', () => {
    expect(
      matchEpisode({ ...episode, title: 'كيف تبني علامتك على لينكدإن' }, [video]).videoId,
    ).toBeNull();
    expect(matchEpisode({ ...episode, episodeType: 'trailer' }, [video]).videoId).toBeNull();
    expect(matchEpisode(episode, [{ ...video, title: `${video.title} إعلان` }]).videoId).toBeNull();
  });
  it('requires public official-channel metadata even for an exact title', () => {
    for (const patch of [
      { channel_id: 'other' },
      { availability: 'private' },
      { availability: undefined },
      { live_status: 'is_upcoming' },
      { live_status: 'is_live' },
    ])
      expect(matchEpisode(episode, [{ ...video, ...patch }]).videoId).toBeNull();
  });
  it('allows full discussions about advertising while excluding promotional labels', () => {
    for (const title of [
      'البدايات من دراسة العلوم الشرعية إلى كتابة الإعلانات',
      'احذر المبالغة كيف تصنع حملة إعلانية وتزيد أرباحك',
      'أخطر أسرار التسويق الإعلان لا ينقذ المنتج السيئ',
    ]) {
      expect(matchEpisode({ ...episode, title }, [{ ...video, title }]).videoId).toBe(video.id);
    }
    for (const title of [
      'إعلان الحلقة الجديدة',
      'برومو الحلقة الجديدة',
      'التشويقة: حلقتنا القادمة',
    ])
      expect(matchEpisode({ ...episode, title }, [{ ...video, title }]).videoId).toBeNull();
  });
  it('never treats a repeated program introduction as episode-specific evidence', () => {
    const introduction = Array.from({ length: 60 }, (_, i) => `introductionword${i}`).join(' ');
    const episodes = [
      { ...episode, description: introduction },
      { ...episode, id: 'ep-2', guid: 'guid-2', durationSec: 9000, description: introduction },
    ];
    const retitled = {
      ...video,
      title: 'A completely different episode',
      description: introduction,
    };
    expect(matchEpisode(episodes[0]!, [retitled]).videoId).toBe(video.id);
    expect(buildMatches([{ ...show, episodes }], [retitled]).every((i) => !i.videoId)).toBe(true);
  });
  it('retains the full 45-word evidence requirement at a non-grid final window', () => {
    const words = Array.from({ length: 53 }, (_, i) => `specificword${i}`);
    const source = { ...episode, description: words.join(' ') };
    const retitled = {
      ...video,
      title: 'A retitled interview',
      description: ['rewritten', ...words.slice(1)].join(' '),
    };
    expect(matchEpisode(source, [retitled]).videoId).toBe(video.id);
    expect(
      matchEpisode({ ...source, description: words.slice(0, 44).join(' ') }, [retitled]).videoId,
    ).toBeNull();
  });
  it('blocks every member of a duplicate match, not just the first', () => {
    const items = buildMatches(
      [{ ...show, episodes: [episode, { ...episode, id: 'ep-2' }] }],
      [video],
    );
    expect(items.every((i) => i.videoId === null)).toBe(true);
  });
  it('accepts a retitled episode only with a long exact official description and duration', () => {
    const description =
      'لماذا نكرر نفس السلوكيات الخاطئة وتداهمنا المشاعر السلبية رغم إدراكنا العقلي التام لضررها في هذه الحلقة من بودكاست أروقة يأخذنا الدكتور عبدالله هادي المدرب في التطوير الشخصي والإداري في رحلة لاستكشاف هندسة الأفكار باعتبارها المحرك الخفي لواقعنا حيث يفكك أخطاء التفكير الشائعة ويقدم تطبيقات عملية وتمارين يومية لمراقبة المشاعر';
    const changed = {
      ...video,
      title: 'عنوان مختلف كليًا',
      description,
      channel_id: 'UC8vdjzu_0QMQlG9qNT5D_AQ',
      availability: 'public',
    };
    expect(matchEpisode({ ...episode, description }, [changed]).status).toBe(
      'exact-description-duration',
    );
    expect(
      matchEpisode({ ...episode, description }, [{ ...changed, channel_id: 'other' }]).videoId,
    ).toBeNull();
    expect(
      matchEpisode({ ...episode, description: 'تابعونا على مختلف للمزيد من الحلقات' }, [changed])
        .videoId,
    ).toBeNull();
    expect(
      matchEpisode({ ...episode, description }, [{ ...changed, duration: 10 }]).videoId,
    ).toBeNull();
  });
  it('preserves premium episodes and every changed identity or existing Studio choice', () => {
    const match = buildMatches([show], [video])[0]!;
    const row = {
      id: episode.id,
      show_id: show.id,
      rss_guid: episode.guid,
      title_ar: episode.title,
      duration_sec: episode.durationSec,
      premium: false,
      youtube_video_id: null,
    };
    expect(videoLinkState(row, match)).toBe('link');
    expect(videoLinkState({ ...row, youtube_video_id: video.id }, match)).toBe('unchanged');
    for (const patch of [
      { premium: true },
      { rss_guid: 'other' },
      { show_id: 'other' },
      { title_ar: 'edited' },
      { duration_sec: 200 },
      { youtube_video_id: 'M7YKLiadjIE' },
    ])
      expect(videoLinkState({ ...row, ...patch }, match)).toBe('conflict');
  });
});
