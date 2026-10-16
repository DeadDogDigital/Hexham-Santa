-- Additive fields for group briefing selection and arrival tracking.
alter table public.santa_bookings
  add column if not exists group_print_selected boolean not null default false;
alter table public.santa_bookings
  add column if not exists checked_in_at timestamptz;
