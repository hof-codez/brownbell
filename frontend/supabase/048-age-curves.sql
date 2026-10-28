-- 048-age-curves.sql
-- Age curves fitted from past seasons by tc-fit-curves.js, with a backtest against the hand-made curves.
alter table tc_settings add column if not exists age_curves jsonb;
