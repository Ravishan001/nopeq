-- =========================================================
-- NopeQ migration 005: reschedule requests (customer asks, owner approves)
-- Run once in Supabase → SQL Editor (safe to run again)
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
