-- 044-trade-snapshots.sql
-- A roster snapshot for each league trade: both teams' QB/RB/WR/TE players as they stood
-- just before the trade, with points per game up to that week. Rebuilt by tc-seed.js from
-- Sleeper's transaction log. Used by the History tab to explain why a trade made sense.
create table if not exists tc_trade_snapshots (
    trade_id text primary key references tc_real_trades(id) on delete cascade,
    season int not null,
    week int not null,
    basis text not null check (basis in ('this', 'last')),   -- ppg from this season so far, or last season
    injuries_known boolean not null default false,            -- injury status was captured near the trade
    roster_a jsonb not null,                                  -- [{id,name,pos,age,ppg,games,inj}]
    roster_b jsonb not null,
    taken_at timestamptz not null default now()
);
alter table tc_trade_snapshots enable row level security;
