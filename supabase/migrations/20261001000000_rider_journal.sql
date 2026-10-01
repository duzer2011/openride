-- "From the road" rider journal, step 1.
-- NOT APPLIED. Review, then run once in the Supabase SQL editor (or `supabase db push`).
-- Does not touch the existing journal_entries table (RLS is off there).
--
-- What this creates:
--   1. public.rider_journal: one row per rider, tour and day. Owner-only via row level security.
--   2. A private storage bucket, rider-media, with one folder per user (<user_id>/<route_slug>/<day>/<file>).
--      Owner-only via storage policies. Videos are capped at 100 MB by the bucket.
-- The app writes with the rider's own login (never the service key), so these policies are what protect the data.

-- ---------- table ----------
create table if not exists public.rider_journal (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  route_slug  text not null,
  day         smallint not null check (day between 1 and 14),
  body        text not null default '',
  updated_at  timestamptz not null default now(),
  unique (user_id, route_slug, day)
);

create index if not exists rider_journal_user_route_idx on public.rider_journal (user_id, route_slug);

alter table public.rider_journal enable row level security;

create policy "rider_journal: read own"   on public.rider_journal for select to authenticated using (auth.uid() = user_id);
create policy "rider_journal: insert own" on public.rider_journal for insert to authenticated with check (auth.uid() = user_id);
create policy "rider_journal: update own" on public.rider_journal for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rider_journal: delete own" on public.rider_journal for delete to authenticated using (auth.uid() = user_id);

-- ---------- private media bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rider-media', 'rider-media', false, 104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

-- A rider can only touch objects whose first folder is their own user id.
create policy "rider_media: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'rider-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rider_media: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'rider-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rider_media: update own" on storage.objects for update to authenticated
  using (bucket_id = 'rider-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'rider-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rider_media: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'rider-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- how to undo ----------
-- drop policy if exists "rider_media: read own" on storage.objects;  (and the other three)
-- delete from storage.buckets where id = 'rider-media';  -- only after the bucket is emptied
-- drop table if exists public.rider_journal;
