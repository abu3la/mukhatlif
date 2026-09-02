-- Keep the byline location with the article so web and email renderers agree.
-- The default is retained during rolling deployment for older API revisions.

alter table public.articles
  add column author_placement text not null default 'after_title',
  add constraint articles_author_placement_check check (
    author_placement in ('after_title', 'end')
  );
