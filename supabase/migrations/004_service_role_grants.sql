-- =========================================================
-- NopeQ migration 004: let the server (service_role) read/write tables
-- Needed because "Automatically expose new tables" is OFF on this project.
-- Run once in Supabase → SQL Editor (safe to run again)
-- =========================================================
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
