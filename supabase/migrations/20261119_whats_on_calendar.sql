create table if not exists public.santa_whats_on_events (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 event_date date not null,
 end_date date,
 start_time time,
 end_time time,
 venue text,
 description text,
 category text not null default 'Community',
 booking_url text,
 info_url text,
 published boolean not null default false,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.santa_whats_on_events enable row level security;
create policy "Public can view published whats on events" on public.santa_whats_on_events for select using (published = true);
create policy "Admins can manage whats on events" on public.santa_whats_on_events for all to authenticated
using (exists (select 1 from public.santa_admins a where a.user_id = auth.uid() and a.role = 'admin'))
with check (exists (select 1 from public.santa_admins a where a.user_id = auth.uid() and a.role = 'admin'));
create index if not exists santa_whats_on_events_date_idx on public.santa_whats_on_events(event_date, sort_order);
