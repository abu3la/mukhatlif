// Reviewed publisher identities, not caller-supplied channel permissions.
// Qadiyah's official RSS (anchor.fm/s/105069b1c/podcast/rss, author إذاعة مختلف)
// names جنائي مختلف and @jinai_mukhtalif, with mukhtalif.net and its bd address.
// YouTube resolves that handle to the ID below and names بودكاست قضية.
// Preserve the public source snapshots in the private migration evidence.
export const OFFICIAL_CHANNELS = {
  main: 'UC8vdjzu_0QMQlG9qNT5D_AQ',
  jinai: 'UCbbF1sfUu2LV2vCads1eqiw',
  riyadi: 'UCfzOXNx3P7hiaJqCXrm9xmA',
  stage: 'UC2_XJBPAErN7jrKwp2DD04A',
  programs: 'UCsStokacx6kw8vuMuRBElqw',
  kfupm: 'UCyX-aDx9h-_pOnwYF66WYUw',
} as const;

export function isOfficialChannel(id: unknown): id is string {
  return Object.values(OFFICIAL_CHANNELS).some((approved) => approved === id);
}

export function channelAllowedForShow(
  channelId: string | undefined,
  showSlug?: string,
  publishedAt?: string,
) {
  // These are source-specific grants, not general trust in all similarly named
  // channels. KFUPM is the original producer credited in Petroly's 2021 RSS,
  // not a claim that the university club is owned by Mukhtalif.
  return (
    channelId === OFFICIAL_CHANNELS.main ||
    (channelId === OFFICIAL_CHANNELS.jinai && showSlug === 'qadiyah') ||
    (channelId === OFFICIAL_CHANNELS.riyadi && ['seera', 'bokra'].includes(showSlug ?? '')) ||
    (channelId === OFFICIAL_CHANNELS.stage && showSlug === 'arwiqah') ||
    (channelId === OFFICIAL_CHANNELS.programs && ['seera', 'qadiyah'].includes(showSlug ?? '')) ||
    (channelId === OFFICIAL_CHANNELS.kfupm &&
      showSlug === 'petroly' &&
      Number.isFinite(Date.parse(publishedAt ?? '')) &&
      Date.parse(publishedAt!) < Date.parse('2022-01-01'))
  );
}
