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
