import type { MessageKey } from './ar';

/** Typed against the Arabic catalog: a missing English key is a compile error. */
export const en: Record<MessageKey, string> = {
  'brand.name': 'Mukhtalif',
  'brand.tagline': 'For a career path that suits you',

  'nav.overview': 'Overview',
  'nav.shows': 'Shows',
  'nav.episodes': 'Episodes',
  'nav.articles': 'Articles',
  'nav.subscribers': 'Subscribers',
  'nav.library': 'My library',
  'nav.account': 'Account',

  'episode.status.draft': 'Draft',
  'episode.status.scheduled': 'Scheduled',
  'episode.status.published': 'Published',
  'episode.status.archived': 'Archived',

  'article.status.draft': 'Draft',
  'article.status.published': 'Published',

  'subscription.status.active': 'Active',
  'subscription.status.past_due': 'Past due',
  'subscription.status.canceled': 'Canceled',

  'action.play': 'Play',
  'action.pause': 'Pause',
  'action.follow': 'Follow',
  'action.unfollow': 'Unfollow',
  'action.signIn': 'Sign in',
  'action.subscribe': 'Subscribe',

  'label.premium': 'Premium',
  'label.episode': 'Episode',
  'label.host': 'Hosted by',

  'state.loading': 'Loading…',
  'state.error': 'Cannot reach the server',
  'state.empty': 'Nothing here yet',
};
