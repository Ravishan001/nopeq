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

-- =========================================================
-- Walk-ins + blocked time (same as supabase/migrations/006_walkins_blocks.sql)
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

-- =========================================================
-- NopeQ migration 007: business types & modes
--   * mode 'slots'  → appointments (salon, barber, tattoo, clinic …)
--   * mode 'orders' → pick a day (cake shop, bakery, florist, catering …)
-- Plus tattoo extras: artist portfolio, reference photos, deposit, prep note.
-- Safe to run more than once.
-- =========================================================

-- ---------- businesses ----------
alter table public.businesses add column if not exists mode text not null default 'slots';
alter table public.businesses drop constraint if exists businesses_mode_check;
alter table public.businesses add constraint businesses_mode_check check (mode in ('slots', 'orders'));
alter table public.businesses add column if not exists daily_limit   int not null default 6;
alter table public.businesses add column if not exists lead_days     int not null default 1;
alter table public.businesses add column if not exists delivery_fee  numeric(12,2);          -- null = pickup only
alter table public.businesses add column if not exists advance_pct   int not null default 0;  -- orders: advance to confirm
alter table public.businesses add column if not exists deposit_amount numeric(12,2) not null default 0; -- appointments: deposit
alter table public.businesses add column if not exists prep_note     text;
alter table public.businesses drop constraint if exists businesses_rules_check;
alter table public.businesses add constraint businesses_rules_check check (
  daily_limit between 1 and 500 and lead_days between 0 and 60 and advance_pct between 0 and 100
  and (delivery_fee is null or delivery_fee >= 0) and deposit_amount >= 0
  and (prep_note is null or char_length(prep_note) <= 300));

-- ---------- services: description, photo, sizes & flavours ----------
alter table public.services add column if not exists description text;
alter table public.services add column if not exists image_url   text;
alter table public.services add column if not exists options     jsonb not null default '{}'::jsonb; -- {"sizes":[{"label":"1 kg","price":3500}],"flavours":["Chocolate"]}
alter table public.services drop constraint if exists services_extra_check;
alter table public.services add constraint services_extra_check check (
  (description is null or char_length(description) <= 120) and jsonb_typeof(options) = 'object');

-- ---------- staff: specialty + portfolio ----------
alter table public.staff add column if not exists specialty text;
alter table public.staff add column if not exists portfolio text[] not null default '{}';
alter table public.staff drop constraint if exists staff_extra_check;
alter table public.staff add constraint staff_extra_check check (
  (specialty is null or char_length(specialty) <= 60) and cardinality(portfolio) <= 12);

-- ---------- bookings: reference photos + placement (tattoo) ----------
alter table public.bookings add column if not exists ref_urls  text[] not null default '{}';
alter table public.bookings add column if not exists placement text;
alter table public.bookings drop constraint if exists bookings_extra_check;
alter table public.bookings add constraint bookings_extra_check check (
  cardinality(ref_urls) <= 3 and (placement is null or char_length(placement) <= 100));

-- ---------- orders ----------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  service_id      uuid references public.services(id) on delete set null,
  item_name       text not null check (char_length(item_name) between 1 and 80),
  size            text check (char_length(size) <= 40),
  flavour         text check (char_length(flavour) <= 40),
  message         text check (char_length(message) <= 80),
  design_url      text check (char_length(design_url) <= 400),
  fulfilment      text not null default 'pickup' check (fulfilment in ('pickup', 'delivery')),
  address         text check (char_length(address) <= 200),
  due_date        date not null,
  time_pref       text check (time_pref in ('morning', 'afternoon', 'evening')),
  customer_name   text not null check (char_length(customer_name) between 2 and 60),
  customer_phone  text check (customer_phone ~ '^\+?[0-9]{6,16}$'),
  note            text check (char_length(note) <= 300),
  total           numeric(12,2) not null default 0 check (total >= 0),
  advance         numeric(12,2) not null default 0 check (advance >= 0),
  advance_paid    boolean not null default false,
  status          text not null default 'new' check (status in ('new', 'confirmed', 'making', 'ready', 'done', 'cancelled')),
  source          text not null default 'online' check (source in ('online', 'phone')),
  token           text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at      timestamptz not null default now()
);
create index if not exists orders_business_day on public.orders(business_id, due_date);
alter table public.orders enable row level security;
drop policy if exists "owner all" on public.orders;
create policy "owner all" on public.orders for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;

-- days the shop takes no orders
create table if not exists public.closed_days (
  business_id uuid not null references public.businesses(id) on delete cascade,
  day         date not null,
  primary key (business_id, day)
);
alter table public.closed_days enable row level security;
drop policy if exists "owner all" on public.closed_days;
create policy "owner all" on public.closed_days for all
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
grant select, insert, update, delete on public.closed_days to authenticated;
grant all on public.closed_days to service_role;

-- ---------- public: how full each day is (counts only, no customer data) ----------
create or replace function public.order_days(p_business_id uuid, p_from date, p_to date)
returns table (day date, taken int, closed boolean)
language sql stable security definer set search_path = public as $$
  select g::date,
         (select count(*)::int from orders o where o.business_id = p_business_id and o.due_date = g::date and o.status <> 'cancelled'),
         exists (select 1 from closed_days c where c.business_id = p_business_id and c.day = g::date)
    from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') g
   where public.is_public(p_business_id);
$$;

-- ---------- public: place an order ----------
create or replace function public.place_order(
  p_business_id uuid, p_service_id uuid, p_size text, p_flavour text, p_message text, p_design_url text,
  p_fulfilment text, p_address text, p_due date, p_time_pref text, p_name text, p_phone text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare b record; s record; v_price numeric; v_fee numeric := 0; v_today date; v_token text; v_open boolean; v_taken int;
begin
  select * into b from businesses where id = p_business_id and is_published;
  if b.id is null or b.mode <> 'orders' then raise exception 'not_found'; end if;
  select * into s from services where id = p_service_id and business_id = p_business_id and active;
  if s.id is null then raise exception 'bad_service'; end if;

  -- price comes from the database, never from the browser
  if jsonb_array_length(coalesce(s.options->'sizes', '[]'::jsonb)) > 0 then
    select (x->>'price')::numeric into v_price from jsonb_array_elements(s.options->'sizes') x where x->>'label' = p_size limit 1;
    if v_price is null then raise exception 'bad_size'; end if;
  else
    v_price := s.price; p_size := null;
  end if;
  if jsonb_array_length(coalesce(s.options->'flavours', '[]'::jsonb)) > 0 then
    if p_flavour is null or not (s.options->'flavours') ? p_flavour then raise exception 'bad_flavour'; end if;
  else
    p_flavour := null;
  end if;
  if p_fulfilment = 'delivery' then
    if b.delivery_fee is null then raise exception 'no_delivery'; end if;
    if coalesce(trim(p_address), '') = '' then raise exception 'address'; end if;
    v_fee := b.delivery_fee;
  elsif p_fulfilment <> 'pickup' then raise exception 'bad_fulfilment';
  end if;
  if p_design_url is not null and p_design_url !~ '/storage/v1/object/public/media/refs/' then raise exception 'bad_photo'; end if;

  v_today := (now() at time zone b.timezone)::date;
  if p_due < v_today + b.lead_days then raise exception 'too_soon'; end if;
  if p_due > v_today + 120 then raise exception 'too_far'; end if;
  select is_open into v_open from business_hours where business_id = p_business_id and weekday = extract(dow from p_due)::int;
  if not coalesce(v_open, false) or exists (select 1 from closed_days where business_id = p_business_id and day = p_due) then
    raise exception 'closed';
  end if;

  if (select count(*) from orders where business_id = p_business_id and customer_phone = p_phone
        and status not in ('done', 'cancelled') and due_date >= v_today) >= 3 then raise exception 'too_many'; end if;
  if (select count(*) from orders where customer_phone = p_phone and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too_many'; end if;

  perform pg_advisory_xact_lock(hashtext('orders' || p_business_id::text));
  select count(*) into v_taken from orders where business_id = p_business_id and due_date = p_due and status <> 'cancelled';
  if v_taken >= b.daily_limit then raise exception 'day_full'; end if;

  insert into orders (business_id, service_id, item_name, size, flavour, message, design_url, fulfilment, address,
                      due_date, time_pref, customer_name, customer_phone, note, total, advance)
  values (p_business_id, s.id, s.name, p_size, p_flavour, nullif(trim(p_message), ''), p_design_url, p_fulfilment,
          case when p_fulfilment = 'delivery' then trim(p_address) end, p_due, p_time_pref, trim(p_name), p_phone,
          nullif(trim(p_note), ''), v_price + v_fee, round((v_price + v_fee) * b.advance_pct / 100.0))
  returning token into v_token;
  return v_token;
end $$;

-- ---------- public: the customer's own order (by secret token) ----------
create or replace function public.get_order(p_token text)
returns table (item_name text, size text, flavour text, message text, fulfilment text, due_date date, time_pref text,
               total numeric, advance numeric, status text, customer_name text, created_at timestamptz,
               business_name text, slug text, phone text, whatsapp text, currency text, country text, logo_url text)
language sql stable security definer set search_path = public as $$
  select o.item_name, o.size, o.flavour, o.message, o.fulfilment, o.due_date, o.time_pref, o.total, o.advance, o.status,
         o.customer_name, o.created_at, b.name, b.slug, b.phone, b.whatsapp, b.currency, b.country, b.logo_url
    from orders o join businesses b on b.id = o.business_id
   where o.token = p_token;
$$;

revoke all on function public.order_days(uuid,date,date) from public;
grant execute on function public.order_days(uuid,date,date) to anon, authenticated;
revoke all on function public.place_order(uuid,uuid,text,text,text,text,text,text,date,text,text,text,text) from public;
grant execute on function public.place_order(uuid,uuid,text,text,text,text,text,text,date,text,text,text,text) to anon, authenticated;
revoke all on function public.get_order(text) from public;
grant execute on function public.get_order(text) to anon, authenticated;
grant execute on all functions in schema public to service_role;

-- =========================================================
-- NopeQ migration 008: plans & billing
--   * Free = 50 online bookings + orders a month (walk-ins / phone orders don't count)
--   * Pro via bank transfer: owner uploads a slip, Ravion Studio activates it in /admin
--   * owners can never change their own plan
-- Safe to run more than once.
-- =========================================================

alter table public.businesses add column if not exists plan_until    timestamptz;
alter table public.businesses add column if not exists brand_color   text;
alter table public.businesses add column if not exists hide_branding boolean not null default false;
alter table public.businesses drop constraint if exists businesses_brand_check;
alter table public.businesses add constraint businesses_brand_check check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');

-- the plan that is actually in force right now
create or replace function public.plan_of(p_business uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when b.plan <> 'free' and (b.plan_until is null or b.plan_until > now()) then b.plan else 'free' end
    from businesses b where b.id = p_business;
$$;

-- online bookings + orders created this calendar month (business time zone)
create or replace function public.month_usage(p_business uuid)
returns int language sql stable security definer set search_path = public as $$
  with m as (
    select date_trunc('month', now() at time zone b.timezone) at time zone b.timezone as start from businesses b where b.id = p_business
  )
  select (select count(*) from bookings x, m where x.business_id = p_business and x.source = 'online' and x.created_at >= m.start)::int
       + (select count(*) from orders o, m where o.business_id = p_business and o.source = 'online' and o.created_at >= m.start)::int;
$$;

create or replace function public.free_limit() returns int language sql immutable as $$ select 50 $$;

-- for the public booking page: is online booking paused for this month?
create or replace function public.limit_reached(p_business uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_public(p_business) and public.plan_of(p_business) = 'free' and public.month_usage(p_business) >= public.free_limit();
$$;

-- block online bookings / orders past the Free limit
create or replace function public.enforce_free_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'online' and public.plan_of(new.business_id) = 'free'
     and public.month_usage(new.business_id) >= public.free_limit() then
    raise exception 'limit_reached';
  end if;
  return new;
end $$;
drop trigger if exists bookings_free_limit on public.bookings;
create trigger bookings_free_limit before insert on public.bookings for each row execute function public.enforce_free_limit();
drop trigger if exists orders_free_limit on public.orders;
create trigger orders_free_limit before insert on public.orders for each row execute function public.enforce_free_limit();

-- owners (logged-in users) can't give themselves a plan; only the service key (admin panel) can
create or replace function public.protect_plan()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free'; new.plan_until := null;
    elsif new.plan is distinct from old.plan or new.plan_until is distinct from old.plan_until then
      raise exception 'plan_locked';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists businesses_protect_plan on public.businesses;
create trigger businesses_protect_plan before insert or update on public.businesses for each row execute function public.protect_plan();

-- ---------- bank transfer requests ----------
create table if not exists public.payment_requests (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  plan         text not null default 'pro' check (plan in ('pro', 'ai')),
  months       int  not null check (months in (1, 12)),
  amount       numeric(12,2) not null check (amount >= 0),
  currency     text not null,
  reference    text not null unique,
  slip_path    text check (char_length(slip_path) <= 300),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note   text check (char_length(admin_note) <= 200),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists payment_requests_status on public.payment_requests(status, created_at desc);
alter table public.payment_requests enable row level security;
drop policy if exists "owner read" on public.payment_requests;
create policy "owner read" on public.payment_requests for select using (public.is_owner(business_id));
grant select on public.payment_requests to authenticated;
grant all on public.payment_requests to service_role;

-- owners create requests only through these (the amount comes from the server's price list)
create or replace function public.request_upgrade(p_business uuid, p_months int, p_amount numeric, p_currency text)
returns text language plpgsql security definer set search_path = public as $$
declare v_ref text;
begin
  if not public.is_owner(p_business) then raise exception 'not_allowed'; end if;
  if p_months not in (1, 12) then raise exception 'bad_months'; end if;
  -- reuse an open request that has no slip yet (one reference per payment)
  update payment_requests set months = p_months, amount = p_amount, currency = p_currency
   where business_id = p_business and status = 'pending' and slip_path is null
  returning reference into v_ref;
  if v_ref is not null then return v_ref; end if;
  if (select count(*) from payment_requests where business_id = p_business and status = 'pending') >= 2 then raise exception 'too_many'; end if;
  loop
    v_ref := 'NQ-' || (floor(random() * 9000) + 1000)::int::text;
    exit when not exists (select 1 from payment_requests where reference = v_ref);
  end loop;
  insert into payment_requests (business_id, months, amount, currency, reference)
  values (p_business, p_months, p_amount, p_currency, v_ref);
  return v_ref;
end $$;

create or replace function public.attach_slip(p_reference text, p_slip_path text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_slip_path is null or split_part(p_slip_path, '/', 1) <> auth.uid()::text or char_length(p_slip_path) > 300 then raise exception 'bad_slip'; end if;
  update payment_requests r set slip_path = p_slip_path, created_at = now()
   where r.reference = p_reference and r.status = 'pending' and public.is_owner(r.business_id);
  return found;
end $$;
drop function if exists public.request_upgrade(uuid,int,numeric,text,text);
revoke all on function public.request_upgrade(uuid,int,numeric,text) from public, anon;
grant execute on function public.request_upgrade(uuid,int,numeric,text) to authenticated;
revoke all on function public.attach_slip(text,text) from public, anon;
grant execute on function public.attach_slip(text,text) to authenticated;

-- bank details shown on the payment page (edited in /admin)
create table if not exists public.billing_settings (
  id           int primary key default 1 check (id = 1),
  account_name text, bank text, branch text, account_no text, note text,
  updated_at   timestamptz not null default now()
);
insert into public.billing_settings (id, account_name) values (1, 'Ravion Studio') on conflict (id) do nothing;
alter table public.billing_settings enable row level security;
drop policy if exists "signed in read" on public.billing_settings;
create policy "signed in read" on public.billing_settings for select to authenticated using (true);
grant select on public.billing_settings to authenticated;
grant all on public.billing_settings to service_role;

-- ---------- private bucket for payment slips ----------
insert into storage.buckets (id, name, public) values ('slips', 'slips', false) on conflict (id) do nothing;
drop policy if exists "slips owner upload" on storage.objects;
create policy "slips owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "slips owner read" on storage.objects;
create policy "slips owner read" on storage.objects for select to authenticated
  using (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);

grant execute on function public.plan_of(uuid) to anon, authenticated;
grant execute on function public.limit_reached(uuid) to anon, authenticated;
grant execute on function public.month_usage(uuid) to authenticated;
revoke all on function public.month_usage(uuid) from anon;
grant execute on all functions in schema public to service_role;

-- =========================================================
-- NopeQ migration 009: AI assistant (AI plan)
--   * website chat that answers and books for the business
--   * owner settings, chat history, hand-over to the owner
--   * AI plan can be bought with the same bank-transfer flow
-- Safe to run more than once.
-- =========================================================

alter table public.businesses add column if not exists ai_enabled  boolean not null default true;
alter table public.businesses add column if not exists ai_can_book boolean not null default true;
alter table public.businesses add column if not exists ai_lang     text not null default 'auto';
alter table public.businesses add column if not exists ai_tone     text not null default 'friendly';
alter table public.businesses add column if not exists ai_notes    text;
alter table public.businesses add column if not exists ai_limit    int not null default 500;
alter table public.businesses drop constraint if exists businesses_ai_check;
alter table public.businesses add constraint businesses_ai_check check (
  ai_lang in ('auto', 'si', 'en') and ai_tone in ('friendly', 'formal', 'short')
  and (ai_notes is null or char_length(ai_notes) <= 4000) and ai_limit between 0 and 100000);

-- owners can't raise their own chat limit (only the service key / admin can)
create or replace function public.protect_ai_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then new.ai_limit := 500;
    elsif new.ai_limit is distinct from old.ai_limit then raise exception 'plan_locked';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists businesses_protect_ai_limit on public.businesses;
create trigger businesses_protect_ai_limit before insert or update on public.businesses for each row execute function public.protect_ai_limit();

-- ---------- chats ----------
create table if not exists public.ai_chats (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  token          text not null unique default encode(gen_random_bytes(16), 'hex'),
  customer_name  text check (char_length(customer_name) <= 60),
  customer_phone text check (char_length(customer_phone) <= 20),
  status         text not null default 'open' check (status in ('open', 'answered', 'booked', 'changed', 'needs_owner')),
  needs_owner    boolean not null default false,
  last_message   text check (char_length(last_message) <= 300),
  message_count  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ai_chats_business on public.ai_chats(business_id, updated_at desc);

create table if not exists public.ai_messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.ai_chats(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'owner')),
  content     text not null check (char_length(content) <= 4000),
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists ai_messages_chat on public.ai_messages(chat_id, created_at);

alter table public.ai_chats enable row level security;
alter table public.ai_messages enable row level security;
-- customers never touch these tables directly (the server does, with the chat's secret token)
drop policy if exists "owner read" on public.ai_chats;
create policy "owner read" on public.ai_chats for select using (public.is_owner(business_id));
drop policy if exists "owner update" on public.ai_chats;
create policy "owner update" on public.ai_chats for update using (public.is_owner(business_id)) with check (public.is_owner(business_id));
drop policy if exists "owner read" on public.ai_messages;
create policy "owner read" on public.ai_messages for select using (exists (select 1 from ai_chats c where c.id = chat_id and public.is_owner(c.business_id)));
drop policy if exists "owner reply" on public.ai_messages;
create policy "owner reply" on public.ai_messages for insert with check (role = 'owner' and exists (select 1 from ai_chats c where c.id = chat_id and public.is_owner(c.business_id)));
grant select, update on public.ai_chats to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant all on public.ai_chats to service_role;
grant all on public.ai_messages to service_role;

-- chats started this calendar month (business time zone)
create or replace function public.ai_month_chats(p_business uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from ai_chats c, businesses b
   where c.business_id = p_business and b.id = p_business
     and c.created_at >= date_trunc('month', now() at time zone b.timezone) at time zone b.timezone;
$$;
revoke all on function public.ai_month_chats(uuid) from public, anon;
grant execute on function public.ai_month_chats(uuid) to authenticated, service_role;

-- ---------- buy the AI plan with the same bank-transfer flow ----------
create or replace function public.request_upgrade(p_business uuid, p_months int, p_amount numeric, p_currency text, p_plan text)
returns text language plpgsql security definer set search_path = public as $$
declare v_ref text;
begin
  if not public.is_owner(p_business) then raise exception 'not_allowed'; end if;
  if p_months not in (1, 12) then raise exception 'bad_months'; end if;
  if p_plan not in ('pro', 'ai') then raise exception 'bad_plan'; end if;
  update payment_requests set months = p_months, amount = p_amount, currency = p_currency, plan = p_plan
   where business_id = p_business and status = 'pending' and slip_path is null
  returning reference into v_ref;
  if v_ref is not null then return v_ref; end if;
  if (select count(*) from payment_requests where business_id = p_business and status = 'pending') >= 2 then raise exception 'too_many'; end if;
  loop
    v_ref := 'NQ-' || (floor(random() * 9000) + 1000)::int::text;
    exit when not exists (select 1 from payment_requests where reference = v_ref);
  end loop;
  insert into payment_requests (business_id, plan, months, amount, currency, reference)
  values (p_business, p_plan, p_months, p_amount, p_currency, v_ref);
  return v_ref;
end $$;
revoke all on function public.request_upgrade(uuid,int,numeric,text,text) from public, anon;
grant execute on function public.request_upgrade(uuid,int,numeric,text,text) to authenticated;
grant execute on all functions in schema public to service_role;

-- =========================================================
-- NopeQ migration 010: public booking page columns
-- Visitors (not logged in) can read only these columns of a business.
-- Migrations 007/008/009 added new ones the booking page needs
-- (cake orders, tattoo deposit, Pro branding, AI chat button).
-- Nothing private (owner, AI notes, limits) is included.
-- Safe to run more than once.
-- =========================================================
grant select (id, slug, name, type, sections, logo_url, cover_url, phone, whatsapp, address, maps_url,
              facebook, instagram, tiktok, is_published, country, currency, timezone,
              mode, daily_limit, lead_days, delivery_fee, advance_pct, deposit_amount, prep_note,
              plan, plan_until, brand_color, hide_branding, ai_enabled)
  on public.businesses to anon;
