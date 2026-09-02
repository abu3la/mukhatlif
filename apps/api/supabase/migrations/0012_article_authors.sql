-- Article attribution supports either a Studio member snapshot or a custom byline.
-- Existing articles remain attributed to the historical Mukhtalif team name.

-- Rollout phase 1: defaults let the previous API revision keep inserting rows
-- while the new revision is deployed. Remove these defaults only in a later
-- migration after every writer sends an explicit author.
alter table public.articles
  add column author_type text not null default 'custom',
  add column author_display_name text not null default 'فريق مختلف',
  add column author_studio_member_id text references public.studio_members (id) on delete restrict;

alter table public.articles
  add constraint articles_author_type_check check (
    author_type in ('studio_member', 'custom')
  ),
  add constraint articles_author_display_name_check check (
    char_length(btrim(author_display_name)) between 2 and 100
  ),
  add constraint articles_author_source_check check (
    (author_type = 'studio_member' and author_studio_member_id is not null)
    or (author_type = 'custom' and author_studio_member_id is null)
  );

-- Preserve potentially malformed legacy names while enforcing the author
-- contract for every future Studio member insert or name update. Runtime
-- author discovery filters old violating rows until operators repair them and
-- validate this constraint explicitly.
alter table public.studio_members
  add constraint studio_members_article_author_display_name_check check (
    char_length(btrim(display_name)) between 2 and 100
  ) not valid;

create index articles_author_studio_member_idx
  on public.articles (author_studio_member_id)
  where author_studio_member_id is not null;
