-- =========================================================
-- NopeQ database schema (MVP: salon / appointment template)
-- Run this whole file once in Supabase → SQL Editor → New query → Run
-- =========================================================
create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name          text not null check (char_length(name) between 2 and 80),
  type          text not null default 'salon',
  sections      text[] not null default '{}',
  logo_url      text,
  cover_url     text,
  phone         text,
  whatsapp      text,
  address       text,
  maps_url      text,
  facebook      text,
  instagram     text,
  tiktok        text,
  setup_method  text not null default 'manual' check (setup_method in ('manual','ai')),
  plan          text not null default 'free' check (plan in ('free','pro','ai')),
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists businesses_one_per_owner on public.businesses(owner_id);

create table if not exists public.branches (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  address      text,
  created_at   timestamptz not null default now()
);

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  section       text,
  price         integer not null default 0 check (price >= 0),
  duration_min  integer not null default 30 check (duration_min between 5 and 600),
  active        boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.staff (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.business_hours (
  business_id  uuid not null references public.businesses(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  is_open      boolean not null default true,
  open_time    time not null default '09:00',
  close_time   time not null default '20:00',
  primary key (business_id, weekday),
  check (close_time > open_time)
);

create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  service_id      uuid references public.services(id) on delete set null,
  staff_id        uuid references public.staff(id) on delete set null,
  customer_name   text not null check (char_length(customer_name) between 2 and 60),
  customer_phone  text not null check (customer_phone ~ '^[0-9+ ]{9,16}$'),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'confirmed'
                  check (status in ('confirmed','cancelled','completed','no_show')),
  token           text not null unique default encode(gen_random_bytes(12), 'hex'),
  note            text check (char_length(note) <= 300),
  created_at      timestamptz not null default now()
);
create index if not exists bookings_business_time on public.bookings(business_id, starts_at);

-- ---------- helper: is the current user the owner? ----------
create or replace function public.is_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = p_business_id and owner_id = auth.uid());
$$;

create or replace function public.is_public(p_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = p_business_id and is_published);
$$;

-- ---------- Row Level Security ----------
alter table public.businesses     enable row level security;
alter table public.branches       enable row level security;
alter table public.services       enable row level security;
alter table public.staff          enable row level security;
alter table public.business_hours enable row level security;
alter table public.bookings       enable row level security;

-- businesses
drop policy if exists "public read published" on public.businesses;
create policy "public read published" on public.businesses for select using (is_published or owner_id = auth.uid());
drop policy if exists "owner insert" on public.businesses;
create policy "owner insert" on public.businesses for insert with check (owner_id = auth.uid());
drop policy if exists "owner update" on public.businesses;
create policy "owner update" on public.businesses for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner delete" on public.businesses;
create policy "owner delete" on public.businesses for delete using (owner_id = auth.uid());

-- child tables: public can read (for the booking page), only owner can write
do $$
declare t text;
begin
  foreach t in array array['branches','services','staff','business_hours'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (public.is_public(business_id) or public.is_owner(business_id))', t);
    execute format('drop policy if exists "owner write" on public.%I', t);
    execute format('create policy "owner write" on public.%I for all using (public.is_owner(business_id)) with check (public.is_owner(business_id))', t);
  end loop;
end $$;

-- bookings: ONLY the owner can read/update. Customers never read the table directly
-- (they use the functions below, which return no other customer's data).
drop policy if exists "owner read" on public.bookings;
create policy "owner read" on public.bookings for select using (public.is_owner(business_id));
drop policy if exists "owner update" on public.bookings;
create policy "owner update" on public.bookings for update using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- ---------- public functions (no login) ----------

-- busy time ranges for a day (no names / phones leave the database)
create or replace function public.busy_ranges(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.staff_id, b.starts_at, b.ends_at
  from bookings b
  where b.business_id = p_business_id
    and b.status = 'confirmed'
    and b.starts_at < p_to and b.ends_at > p_from
    and public.is_public(p_business_id);
$$;

-- create a booking safely (checks the slot is still free + basic spam limits)
create or replace function public.book_slot(
  p_business_id uuid, p_branch_id uuid, p_service_id uuid, p_staff_id uuid,
  p_name text, p_phone text, p_starts_at timestamptz, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_dur int; v_end timestamptz; v_staff uuid; v_token text; v_has_staff boolean;
  v_dow int; v_open time; v_close time; v_is_open boolean; v_local timestamp;
begin
  if not public.is_public(p_business_id) then raise exception 'not_found'; end if;
  if p_starts_at < now() then raise exception 'past_time'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'too_far'; end if;

  select duration_min into v_dur from services
   where id = p_service_id and business_id = p_business_id and active;
  if v_dur is null then raise exception 'bad_service'; end if;
  v_end := p_starts_at + make_interval(mins => v_dur);

  if p_branch_id is not null and not exists
     (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'bad_branch';
  end if;

  -- inside opening hours (Sri Lanka time)
  v_local := p_starts_at at time zone 'Asia/Colombo';
  v_dow := extract(dow from v_local);
  select is_open, open_time, close_time into v_is_open, v_open, v_close
    from business_hours where business_id = p_business_id and weekday = v_dow;
  if v_is_open is not true or v_local::time < v_open
     or (v_end at time zone 'Asia/Colombo')::time > v_close then
    raise exception 'closed';
  end if;

  -- spam limits: max 3 upcoming bookings per phone per business, 20 bookings per phone per day overall
  if (select count(*) from bookings where business_id = p_business_id and customer_phone = p_phone
        and status = 'confirmed' and starts_at > now()) >= 3 then
    raise exception 'too_many';
  end if;
  if (select count(*) from bookings where customer_phone = p_phone and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many';
  end if;

  -- serialise bookings per business so two people can't grab the same slot
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  select exists(select 1 from staff where business_id = p_business_id and active) into v_has_staff;

  if v_has_staff then
    if p_staff_id is not null then
      if not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id and active) then
        raise exception 'bad_staff';
      end if;
      if exists (select 1 from bookings where staff_id = p_staff_id and status = 'confirmed'
                 and starts_at < v_end and ends_at > p_starts_at) then
        raise exception 'slot_taken';
      end if;
      v_staff := p_staff_id;
    else
      select s.id into v_staff from staff s
       where s.business_id = p_business_id and s.active
         and not exists (select 1 from bookings b where b.staff_id = s.id and b.status = 'confirmed'
                         and b.starts_at < v_end and b.ends_at > p_starts_at)
       order by random() limit 1;
      if v_staff is null then raise exception 'slot_taken'; end if;
    end if;
  else
    if exists (select 1 from bookings where business_id = p_business_id and status = 'confirmed'
               and starts_at < v_end and ends_at > p_starts_at) then
      raise exception 'slot_taken';
    end if;
  end if;

  insert into bookings (business_id, branch_id, service_id, staff_id, customer_name, customer_phone, starts_at, ends_at, note)
  values (p_business_id, p_branch_id, p_service_id, v_staff, trim(p_name), p_phone, p_starts_at, v_end, nullif(trim(p_note), ''))
  returning token into v_token;
  return v_token;
end $$;

-- customer looks at / cancels their own booking with the secret token from the link
create or replace function public.get_booking(p_token text)
returns table (business_name text, business_slug text, service_name text, staff_name text, branch_name text,
               starts_at timestamptz, status text, customer_name text)
language sql stable security definer set search_path = public as $$
  select bz.name, bz.slug, s.name, st.name, br.name, b.starts_at, b.status, b.customer_name
  from bookings b
  join businesses bz on bz.id = b.business_id
  left join services s on s.id = b.service_id
  left join staff st on st.id = b.staff_id
  left join branches br on br.id = b.branch_id
  where b.token = p_token;
$$;

create or replace function public.cancel_booking(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled'
   where token = p_token and status = 'confirmed' and starts_at > now();
  return found;
end $$;

-- only these functions are callable without login
revoke all on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text) from public;
grant execute on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text) to anon, authenticated;
grant execute on function public.busy_ranges(uuid,timestamptz,timestamptz) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;
grant execute on function public.cancel_booking(text) to anon, authenticated;


-- ---------- table privileges ----------
-- (works with "Automatically expose new tables" turned OFF: we grant exactly what the app needs)
grant usage on schema public to anon, authenticated;
-- visitors (no login): read only the public columns of a business + its menu
grant select (id, slug, name, type, sections, logo_url, cover_url, phone, whatsapp, address, maps_url,
              facebook, instagram, tiktok, is_published) on public.businesses to anon;
grant select on public.branches, public.services, public.staff, public.business_hours to anon;
-- owners (logged in): RLS above limits every row to their own business
grant select, insert, update, delete on public.businesses, public.branches, public.services,
  public.staff, public.business_hours to authenticated;
grant select, update on public.bookings to authenticated;
grant execute on function public.is_owner(uuid), public.is_public(uuid) to anon, authenticated;

-- ---------- storage for logos / cover photos ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media owner upload" on storage.objects;
create policy "media owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media owner update" on storage.objects;
create policy "media owner update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================
-- Worldwide support (same as supabase/migrations/002_worldwide.sql)
-- =========================================================

alter table public.businesses add column if not exists country  text not null default 'LK';
alter table public.businesses add column if not exists currency text not null default 'LKR';
alter table public.businesses add column if not exists timezone text not null default 'Asia/Colombo';

-- prices like 12.50 (USD / EUR …)
alter table public.services alter column price type numeric(12,2) using price::numeric;

-- phone numbers are stored as +<country code><number>
alter table public.bookings drop constraint if exists bookings_customer_phone_check;
alter table public.bookings add constraint bookings_customer_phone_check check (customer_phone ~ '^\+?[0-9]{6,16}$');

-- visitors can read the new public columns
grant select (country, currency, timezone) on public.businesses to anon;

-- bookings use the business's own time zone
create or replace function public.book_slot(
  p_business_id uuid, p_branch_id uuid, p_service_id uuid, p_staff_id uuid,
  p_name text, p_phone text, p_starts_at timestamptz, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_dur int; v_end timestamptz; v_staff uuid; v_token text; v_has_staff boolean; v_tz text;
  v_dow int; v_open time; v_close time; v_is_open boolean; v_local timestamp;
begin
  if not public.is_public(p_business_id) then raise exception 'not_found'; end if;
  if p_starts_at < now() then raise exception 'past_time'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'too_far'; end if;

  select timezone into v_tz from businesses where id = p_business_id;

  select duration_min into v_dur from services
   where id = p_service_id and business_id = p_business_id and active;
  if v_dur is null then raise exception 'bad_service'; end if;
  v_end := p_starts_at + make_interval(mins => v_dur);

  if p_branch_id is not null and not exists
     (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'bad_branch';
  end if;

  v_local := p_starts_at at time zone v_tz;
  v_dow := extract(dow from v_local);
  select is_open, open_time, close_time into v_is_open, v_open, v_close
    from business_hours where business_id = p_business_id and weekday = v_dow;
  if v_is_open is not true or v_local::time < v_open
     or (v_end at time zone v_tz)::time > v_close
     or (v_end at time zone v_tz)::date <> v_local::date then
    raise exception 'closed';
  end if;

  if (select count(*) from bookings where business_id = p_business_id and customer_phone = p_phone
        and status = 'confirmed' and starts_at > now()) >= 3 then
    raise exception 'too_many';
  end if;
  if (select count(*) from bookings where customer_phone = p_phone and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  select exists(select 1 from staff where business_id = p_business_id and active) into v_has_staff;

  if v_has_staff then
    if p_staff_id is not null then
      if not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id and active) then
        raise exception 'bad_staff';
      end if;
      if exists (select 1 from bookings where staff_id = p_staff_id and status = 'confirmed'
                 and starts_at < v_end and ends_at > p_starts_at) then
        raise exception 'slot_taken';
      end if;
      v_staff := p_staff_id;
    else
      select s.id into v_staff from staff s
       where s.business_id = p_business_id and s.active
         and not exists (select 1 from bookings b where b.staff_id = s.id and b.status = 'confirmed'
                         and b.starts_at < v_end and b.ends_at > p_starts_at)
       order by random() limit 1;
      if v_staff is null then raise exception 'slot_taken'; end if;
    end if;
  else
    if exists (select 1 from bookings where business_id = p_business_id and status = 'confirmed'
               and starts_at < v_end and ends_at > p_starts_at) then
      raise exception 'slot_taken';
    end if;
  end if;

  insert into bookings (business_id, branch_id, service_id, staff_id, customer_name, customer_phone, starts_at, ends_at, note)
  values (p_business_id, p_branch_id, p_service_id, v_staff, trim(p_name), p_phone, p_starts_at, v_end, nullif(trim(p_note), ''))
  returning token into v_token;
  return v_token;
end $$;

-- booking status page also needs the time zone
drop function if exists public.get_booking(text);
create function public.get_booking(p_token text)
returns table (business_name text, business_slug text, timezone text, service_name text, staff_name text, branch_name text,
               starts_at timestamptz, status text, customer_name text)
language sql stable security definer set search_path = public as $$
  select bz.name, bz.slug, bz.timezone, s.name, st.name, br.name, b.starts_at, b.status, b.customer_name
  from bookings b
  join businesses bz on bz.id = b.business_id
  left join services s on s.id = b.service_id
  left join staff st on st.id = b.staff_id
  left join branches br on br.id = b.branch_id
  where b.token = p_token;
$$;

revoke all on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text) from public;
grant execute on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;

-- =========================================================
-- Notifications (same as supabase/migrations/003_notifications.sql)
-- =========================================================

-- owners' phones / browsers that want push notifications
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- optional customer email (for confirmation + reminder), reminder bookkeeping
alter table public.bookings add column if not exists customer_email text
  check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.bookings add column if not exists reminder_sent_at timestamptz;
create index if not exists bookings_reminder_due on public.bookings(starts_at)
  where status = 'confirmed' and reminder_sent_at is null;

-- owners choose what they get notified about
alter table public.businesses add column if not exists notify_email boolean not null default true;
alter table public.businesses add column if not exists notify_push  boolean not null default true;

-- book_slot gets an optional email (new signature; old one removed)
drop function if exists public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text);
create or replace function public.book_slot(
  p_business_id uuid, p_branch_id uuid, p_service_id uuid, p_staff_id uuid,
  p_name text, p_phone text, p_starts_at timestamptz, p_note text default null, p_email text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_dur int; v_end timestamptz; v_staff uuid; v_token text; v_has_staff boolean; v_tz text;
  v_dow int; v_open time; v_close time; v_is_open boolean; v_local timestamp;
begin
  if not public.is_public(p_business_id) then raise exception 'not_found'; end if;
  if p_starts_at < now() then raise exception 'past_time'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'too_far'; end if;

  select timezone into v_tz from businesses where id = p_business_id;

  select duration_min into v_dur from services
   where id = p_service_id and business_id = p_business_id and active;
  if v_dur is null then raise exception 'bad_service'; end if;
  v_end := p_starts_at + make_interval(mins => v_dur);

  if p_branch_id is not null and not exists
     (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'bad_branch';
  end if;

  v_local := p_starts_at at time zone v_tz;
  v_dow := extract(dow from v_local);
  select is_open, open_time, close_time into v_is_open, v_open, v_close
    from business_hours where business_id = p_business_id and weekday = v_dow;
  if v_is_open is not true or v_local::time < v_open
     or (v_end at time zone v_tz)::time > v_close
     or (v_end at time zone v_tz)::date <> v_local::date then
    raise exception 'closed';
  end if;

  if (select count(*) from bookings where business_id = p_business_id and customer_phone = p_phone
        and status = 'confirmed' and starts_at > now()) >= 3 then
    raise exception 'too_many';
  end if;
  if (select count(*) from bookings where customer_phone = p_phone and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  select exists(select 1 from staff where business_id = p_business_id and active) into v_has_staff;

  if v_has_staff then
    if p_staff_id is not null then
      if not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id and active) then
        raise exception 'bad_staff';
      end if;
      if exists (select 1 from bookings where staff_id = p_staff_id and status = 'confirmed'
                 and starts_at < v_end and ends_at > p_starts_at) then
        raise exception 'slot_taken';
      end if;
      v_staff := p_staff_id;
    else
      select s.id into v_staff from staff s
       where s.business_id = p_business_id and s.active
         and not exists (select 1 from bookings b where b.staff_id = s.id and b.status = 'confirmed'
                         and b.starts_at < v_end and b.ends_at > p_starts_at)
       order by random() limit 1;
      if v_staff is null then raise exception 'slot_taken'; end if;
    end if;
  else
    if exists (select 1 from bookings where business_id = p_business_id and status = 'confirmed'
               and starts_at < v_end and ends_at > p_starts_at) then
      raise exception 'slot_taken';
    end if;
  end if;

  insert into bookings (business_id, branch_id, service_id, staff_id, customer_name, customer_phone, customer_email, starts_at, ends_at, note)
  values (p_business_id, p_branch_id, p_service_id, v_staff, trim(p_name), p_phone, nullif(lower(trim(p_email)), ''), p_starts_at, v_end, nullif(trim(p_note), ''))
  returning token into v_token;
  return v_token;
end $$;

revoke all on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text) from public;
grant execute on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text) to anon, authenticated;

-- =========================================================
-- Server (service_role) privileges (same as supabase/migrations/004_service_role_grants.sql)
-- =========================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- =========================================================
-- Reschedule requests (same as supabase/migrations/005_reschedule.sql)
-- =========================================================

alter table public.bookings add column if not exists request_status text check (request_status in ('pending'));
alter table public.bookings add column if not exists requested_starts_at timestamptz;
alter table public.bookings add column if not exists requested_ends_at timestamptz;
alter table public.bookings add column if not exists requested_staff_id uuid references public.staff(id) on delete set null;
alter table public.bookings add column if not exists requested_at timestamptz;

-- is [start, end) inside the business's opening hours (in its own time zone)?
create or replace function public.within_hours(p_business uuid, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_local timestamp; v_open time; v_close time; v_is_open boolean;
begin
  select timezone into v_tz from businesses where id = p_business;
  v_local := p_start at time zone v_tz;
  select is_open, open_time, close_time into v_is_open, v_open, v_close
    from business_hours where business_id = p_business and weekday = extract(dow from v_local);
  return v_is_open is true and v_local::time >= v_open
     and (p_end at time zone v_tz)::time <= v_close
     and (p_end at time zone v_tz)::date = v_local::date;
end $$;

-- does anything (a booking, or a pending change request) already use this time?
-- p_staff null = the whole business (used when a business has no staff)
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
  );
$$;

-- busy times for the booking page now also hold slots that are waiting for approval
create or replace function public.busy_ranges(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns table (staff_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.staff_id, b.starts_at, b.ends_at from bookings b
   where b.business_id = p_business_id and b.status = 'confirmed'
     and b.starts_at < p_to and b.ends_at > p_from and public.is_public(p_business_id)
  union all
  select b.requested_staff_id, b.requested_starts_at, b.requested_ends_at from bookings b
   where b.business_id = p_business_id and b.status = 'confirmed' and b.request_status = 'pending'
     and b.requested_starts_at < p_to and b.requested_ends_at > p_from and public.is_public(p_business_id);
$$;

-- book_slot: same rules as before, now using the shared helpers
create or replace function public.book_slot(
  p_business_id uuid, p_branch_id uuid, p_service_id uuid, p_staff_id uuid,
  p_name text, p_phone text, p_starts_at timestamptz, p_note text default null, p_email text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_dur int; v_end timestamptz; v_staff uuid; v_token text; v_has_staff boolean;
begin
  if not public.is_public(p_business_id) then raise exception 'not_found'; end if;
  if p_starts_at < now() then raise exception 'past_time'; end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'too_far'; end if;

  select duration_min into v_dur from services where id = p_service_id and business_id = p_business_id and active;
  if v_dur is null then raise exception 'bad_service'; end if;
  v_end := p_starts_at + make_interval(mins => v_dur);

  if p_branch_id is not null and not exists (select 1 from branches where id = p_branch_id and business_id = p_business_id) then
    raise exception 'bad_branch';
  end if;
  if not public.within_hours(p_business_id, p_starts_at, v_end) then raise exception 'closed'; end if;

  if (select count(*) from bookings where business_id = p_business_id and customer_phone = p_phone
        and status = 'confirmed' and starts_at > now()) >= 3 then raise exception 'too_many'; end if;
  if (select count(*) from bookings where customer_phone = p_phone and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many'; end if;

  perform pg_advisory_xact_lock(hashtext(p_business_id::text));
  select exists(select 1 from staff where business_id = p_business_id and active) into v_has_staff;

  if v_has_staff then
    if p_staff_id is not null then
      if not exists (select 1 from staff where id = p_staff_id and business_id = p_business_id and active) then raise exception 'bad_staff'; end if;
      if public.slot_conflict(p_business_id, p_staff_id, p_starts_at, v_end) then raise exception 'slot_taken'; end if;
      v_staff := p_staff_id;
    else
      select s.id into v_staff from staff s
       where s.business_id = p_business_id and s.active
         and not public.slot_conflict(p_business_id, s.id, p_starts_at, v_end)
       order by random() limit 1;
      if v_staff is null then raise exception 'slot_taken'; end if;
    end if;
  elsif public.slot_conflict(p_business_id, null, p_starts_at, v_end) then
    raise exception 'slot_taken';
  end if;

  insert into bookings (business_id, branch_id, service_id, staff_id, customer_name, customer_phone, customer_email, starts_at, ends_at, note)
  values (p_business_id, p_branch_id, p_service_id, v_staff, trim(p_name), p_phone, nullif(lower(trim(p_email)), ''), p_starts_at, v_end, nullif(trim(p_note), ''))
  returning token into v_token;
  return v_token;
end $$;

-- customer asks to move their booking (salon must approve). The new slot is held meanwhile.
create or replace function public.request_reschedule(p_token text, p_starts_at timestamptz, p_staff_id uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype; v_end timestamptz; v_staff uuid; v_has_staff boolean;
begin
  select * into b from bookings where token = p_token;
  if not found or b.status <> 'confirmed' or b.starts_at < now() then raise exception 'not_allowed'; end if;
  if p_starts_at < now() + interval '30 minutes' or p_starts_at > now() + interval '90 days' then raise exception 'bad_time'; end if;
  v_end := p_starts_at + (b.ends_at - b.starts_at);
  if not public.within_hours(b.business_id, p_starts_at, v_end) then raise exception 'closed'; end if;

  perform pg_advisory_xact_lock(hashtext(b.business_id::text));
  select exists(select 1 from staff where business_id = b.business_id and active) into v_has_staff;

  if v_has_staff then
    if p_staff_id is not null then
      if not exists (select 1 from staff where id = p_staff_id and business_id = b.business_id and active) then raise exception 'bad_staff'; end if;
      if public.slot_conflict(b.business_id, p_staff_id, p_starts_at, v_end, b.id) then raise exception 'slot_taken'; end if;
      v_staff := p_staff_id;
    else
      select s.id into v_staff from staff s
       where s.business_id = b.business_id and s.active
         and not public.slot_conflict(b.business_id, s.id, p_starts_at, v_end, b.id)
       order by (s.id = b.staff_id) desc, random() limit 1;   -- keep the same stylist when possible
      if v_staff is null then raise exception 'slot_taken'; end if;
    end if;
  elsif public.slot_conflict(b.business_id, null, p_starts_at, v_end, b.id) then
    raise exception 'slot_taken';
  end if;

  update bookings set request_status = 'pending', requested_starts_at = p_starts_at, requested_ends_at = v_end,
         requested_staff_id = v_staff, requested_at = now()
   where id = b.id;
  return 'pending';
end $$;

-- customer withdraws their change request
create or replace function public.withdraw_reschedule(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update bookings set request_status = null, requested_starts_at = null, requested_ends_at = null, requested_staff_id = null, requested_at = null
   where token = p_token and request_status = 'pending';
  return found;
end $$;

-- owner approves or declines
create or replace function public.decide_reschedule(p_booking_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking_id;
  if not found or not public.is_owner(b.business_id) then raise exception 'not_allowed'; end if;
  if b.request_status is distinct from 'pending' then return 'none'; end if;

  if p_approve then
    perform pg_advisory_xact_lock(hashtext(b.business_id::text));
    -- someone else may have the time now (e.g. a manual change) – check again, ignoring this booking itself
    if exists (select 1 from bookings x where x.business_id = b.business_id and x.status = 'confirmed' and x.id <> b.id
                 and (b.requested_staff_id is null or x.staff_id = b.requested_staff_id)
                 and x.starts_at < b.requested_ends_at and x.ends_at > b.requested_starts_at) then
      return 'conflict';
    end if;
    update bookings set starts_at = requested_starts_at, ends_at = requested_ends_at,
           staff_id = coalesce(requested_staff_id, staff_id), reminder_sent_at = null,
           request_status = null, requested_starts_at = null, requested_ends_at = null, requested_staff_id = null, requested_at = null
     where id = b.id;
    return 'approved';
  end if;

  update bookings set request_status = null, requested_starts_at = null, requested_ends_at = null, requested_staff_id = null, requested_at = null
   where id = b.id;
  return 'declined';
end $$;

-- booking status page: include what's needed to pick a new time + the pending request
drop function if exists public.get_booking(text);
create function public.get_booking(p_token text)
returns table (business_name text, business_slug text, timezone text, service_name text, staff_name text, branch_name text,
               starts_at timestamptz, status text, customer_name text,
               business_id uuid, service_id uuid, staff_id uuid,
               request_status text, requested_starts_at timestamptz, requested_staff_name text)
language sql stable security definer set search_path = public as $$
  select bz.name, bz.slug, bz.timezone, s.name, st.name, br.name, b.starts_at, b.status, b.customer_name,
         b.business_id, b.service_id, b.staff_id, b.request_status, b.requested_starts_at, rs.name
  from bookings b
  join businesses bz on bz.id = b.business_id
  left join services s on s.id = b.service_id
  left join staff st on st.id = b.staff_id
  left join staff rs on rs.id = b.requested_staff_id
  left join branches br on br.id = b.branch_id
  where b.token = p_token;
$$;

-- cancelling also clears any pending request (frees the held slot)
create or replace function public.cancel_booking(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled', request_status = null, requested_starts_at = null, requested_ends_at = null, requested_staff_id = null
   where token = p_token and status = 'confirmed' and starts_at > now();
  return found;
end $$;

revoke all on function public.within_hours(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.slot_conflict(uuid,uuid,timestamptz,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.busy_ranges(uuid,timestamptz,timestamptz) to anon, authenticated;
revoke all on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text) from public;
grant execute on function public.book_slot(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text) to anon, authenticated;
grant execute on function public.request_reschedule(text,timestamptz,uuid) to anon, authenticated;
grant execute on function public.withdraw_reschedule(text) to anon, authenticated;
grant execute on function public.get_booking(text) to anon, authenticated;
grant execute on function public.cancel_booking(text) to anon, authenticated;
revoke all on function public.decide_reschedule(uuid,boolean) from public, anon;
grant execute on function public.decide_reschedule(uuid,boolean) to authenticated;
grant execute on all functions in schema public to service_role;
