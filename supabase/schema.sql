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
