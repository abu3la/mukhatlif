import type { HomepageWeeklyEpisode } from '@mukhtalif/types';
import { EpisodeCard } from './cards';
export function WeeklyEpisodeCard({ episode }: { episode: HomepageWeeklyEpisode }) {
  return <EpisodeCard episode={episode} showName={episode.showTitleAr} />;
}
