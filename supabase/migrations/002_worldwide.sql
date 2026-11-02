-- =========================================================
-- NopeQ migration 002: worldwide (country, currency, time zone, intl phones, decimal prices)
-- Run once in Supabase → SQL Editor (safe to run again)
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
