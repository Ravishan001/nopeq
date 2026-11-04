-- =========================================================
-- NopeQ migration 006: walk-in bookings + blocked time (lunch / leave)
-- Run once in Supabase → SQL Editor (safe to run again)
-- =========================================================

-- walk-ins may not leave a phone number
alter table public.bookings alter column customer_phone drop not null;
alter table public.bookings add column if not exists source text not null default 'online'
  check (source in ('online', 'walkin'));

-- blocked time: staff_id null = whole salon
create table if not exists public.time_blocks (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  staff_id     uuid references public.staff(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  label        text check (char_length(label) <= 40),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists time_blocks_business_time on public.time_blocks(business_id, starts_at);
alter table public.time_blocks enable row level security;
drop policy if exists "owner all" on public.time_blocks;
create policy "owner all" on public.time_blocks for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
grant select, insert, update, delete on public.time_blocks to authenticated;
grant all on public.time_blocks to service_role;

-- conflicts now also include blocked time
create or replace function public.slot_conflict(p_business uuid, p_staff uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings b
    where b.business_id = p_business and b.status = 'confirmed'
      and (p_exclude is null or b.id <> p_exclude)
      and (
        ((p_staff is null or b.staff_id = p_staff) and b.starts_at < p_end and b.ends_at > p_start)
        or (b.request_status = 'pending' and (p_staff is null or b.requested_staff_id = p_staff)
            and b.requested_starts_at < p_end and b.requested_ends_at > p_start)
      )
  ) or exists (
    select 1 from time_blocks t
    where t.business_id = p_business and (t.staff_id is null or p_staff is null or t.staff_id = p_staff)
      and t.starts_at < p_end and t.ends_at > p_start
  );
$$;

-- the public booking page sees blocked time as busy (staff_id null = everyone); no labels leave the database
create or replace function public.busy_ranges(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.staff_id, b.starts_at, b.ends_at from bookings b
   where b.business_id = p_business_id and b.status = 'confirmed'
     and b.starts_at < p_to and b.ends_at > p_from and public.is_public(p_business_id)
  union all
  select b.requested_staff_id, b.requested_starts_at, b.requested_ends_at from bookings b
   where b.business_id = p_business_id and b.status = 'confirmed' and b.request_status = 'pending'
     and b.requested_starts_at < p_to and b.requested_ends_at > p_from and public.is_public(p_business_id)
  union all
  select t.staff_id, t.starts_at, t.ends_at from time_blocks t
   where t.business_id = p_business_id and t.starts_at < p_to and t.ends_at > p_from and public.is_public(p_business_id);
$$;

-- owner adds a walk-in from the slot board
create or replace function public.add_walkin(
  p_business_id uuid, p_staff_id uuid, p_service_id uuid, p_starts_at timestamptz, p_name text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_dur int; v_end timestamptz; v_id uuid;
begin
  if not public.is_owner(p_business_id) then raise exception 'not_allowed'; end if;
  select duration_min into v_dur from services where id = p_service_id and business_id = p_business_id and active;
  if v_dur is null then raise exception 'bad_service'; end if;
  if p_staff_id is not null and not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id) then
    raise exception 'bad_staff';
  end if;
  v_end := p_starts_at + make_interval(mins => v_dur);
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));
  if public.slot_conflict(p_business_id, p_staff_id, p_starts_at, v_end) then raise exception 'slot_taken'; end if;
  insert into bookings (business_id, service_id, staff_id, customer_name, customer_phone, starts_at, ends_at, source)
  values (p_business_id, p_service_id, p_staff_id, coalesce(nullif(trim(p_name), ''), 'Walk-in'), nullif(trim(p_phone), ''), p_starts_at, v_end, 'walkin')
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.slot_conflict(uuid,uuid,timestamptz,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.busy_ranges(uuid,timestamptz,timestamptz) to anon, authenticated;
revoke all on function public.add_walkin(uuid,uuid,uuid,timestamptz,text,text) from public, anon;
grant execute on function public.add_walkin(uuid,uuid,uuid,timestamptz,text,text) to authenticated;
grant execute on all functions in schema public to service_role;
