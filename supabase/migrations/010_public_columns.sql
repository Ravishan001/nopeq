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
