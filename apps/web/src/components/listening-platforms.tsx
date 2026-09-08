const platforms = [
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

export function ListeningPlatforms() {
  return (
    <div className="public-listening">
      <h2>استمع إلى مختلف</h2>
      <div className="public-listening__links">
        {platforms.map((platform) => (
          <a
            key={platform.id}
            href={platform.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${platform.context} على ${platform.label}، يفتح في علامة تبويب جديدة`}
          >
            <img src={`/handoff/platforms/${platform.id}.svg`} width="25" height="25" alt="" />
            <span>
              <bdi>{platform.label}</bdi>
              <small>{platform.context}</small>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
