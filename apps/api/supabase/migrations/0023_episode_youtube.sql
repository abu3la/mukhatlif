begin;

alter table public.episodes
  add column youtube_video_id text;

alter table public.episodes
  add constraint episodes_youtube_video_id_format
  check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');

comment on column public.episodes.youtube_video_id is
  'Verified full-episode YouTube ID. Nullable; never a trailer, guessed match, or arbitrary embed URL.';

notify pgrst, 'reload schema';
commit;
