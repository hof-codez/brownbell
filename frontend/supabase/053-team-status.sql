-- 053-team-status.sql
-- Each team's record and rank, written by tc-seed.js. The calculator uses it to guess whether a
-- team is contending or building when it weighs the long view of a trade.
create table if not exists tc_team_status (
    team_id uuid primary key references teams(id) on delete cascade,
    wins int not null default 0,
    losses int not null default 0,
    ties int not null default 0,
    points_for numeric not null default 0,
    rank int not null,            -- 1 = best record
    size int not null,
    updated_at timestamptz not null default now()
);
alter table tc_team_status enable row level security;
