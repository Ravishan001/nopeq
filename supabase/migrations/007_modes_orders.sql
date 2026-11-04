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
