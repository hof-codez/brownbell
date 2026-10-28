-- 049-usage-model.sql
-- Usage-implied scoring model (points per game from targets, carries, attempts) fitted by tc-fit-usage.js.
alter table tc_settings add column if not exists usage_model jsonb;
