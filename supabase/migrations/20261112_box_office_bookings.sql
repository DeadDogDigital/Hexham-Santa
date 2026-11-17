-- Box office bookings use genuine Ticket Tailor issued tickets, not fabricated order IDs.
alter table public.santa_bookings
  alter column ticket_tailor_order_id drop not null,
  add column if not exists booking_source text not null default 'online'
    check (booking_source in ('online','in_person','complimentary','admin_created')),
  add column if not exists payment_method text
    check (payment_method in ('cash','card','bank_transfer','none','other')),
  add column if not exists payment_status text not null default 'paid'
    check (payment_status in ('paid','unpaid','refunded','not_required')),
  add column if not exists box_office_reference text unique,
  add column if not exists provisioning_status text not null default 'complete'
    check (provisioning_status in ('pending','tickets_issued','booklet_pending','complete','recovery_required')),
  add column if not exists provisioning_error text,
  add column if not exists ticket_tailor_issued_ticket_ids jsonb not null default '[]'::jsonb,
  add column if not exists child_info_request_status text not null default 'not_requested'
    check (child_info_request_status in ('not_requested','pending','sent','failed','completed')),
  add column if not exists child_info_request_sent_at timestamptz;

create table if not exists public.santa_box_office_attempts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  status text not null default 'started'
    check (status in ('started','issuing_tickets','tickets_issued','booking_created','booklet_pending','complete','recovery_required')),
  request_payload jsonb not null,
  booking_id uuid references public.santa_bookings(id) on delete set null,
  issued_tickets jsonb not null default '[]'::jsonb,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.santa_box_office_attempts enable row level security;


create table if not exists public.santa_booking_update_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.santa_bookings(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists santa_booking_update_tokens_booking_idx
  on public.santa_booking_update_tokens(booking_id);
alter table public.santa_booking_update_tokens enable row level security;
