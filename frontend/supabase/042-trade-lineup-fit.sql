-- 042-trade-lineup-fit.sql
-- Data for the calculator's "fit for your team" read. Written daily by tc-seed.js.
--   tc_player_status: points per game under league scoring, injury status, NFL bye week
--   tc_settings: the league's starting lineup slots and last regular season week
create table if not exists tc_player_status (
    asset_id text primary key references tc_assets(id) on delete cascade,
    ppg numeric,
    games int not null default 0,
    injury_status text,
    bye_week int,
    updated_at timestamptz not null default now()
);
alter table tc_player_status enable row level security;

alter table tc_settings add column if not exists lineup_slots text[] not null default '{QB,RB,RB,WR,WR,TE,FLEX}';
alter table tc_settings add column if not exists last_regular_week int not null default 14;
