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
