-- Optional child photographs for the private Santa admin briefing.
-- Additive only: existing booking and child data is unchanged.
alter table public.santa_children
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'santa-child-photos',
  'santa-child-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Santa admins manage child photos'
  ) then
    create policy "Santa admins manage child photos"
      on storage.objects
      for all
      to authenticated
      using (bucket_id = 'santa-child-photos' and public.is_santa_admin())
      with check (bucket_id = 'santa-child-photos' and public.is_santa_admin());
  end if;
end
$$;
