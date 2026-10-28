-- 046-snapshot-byes.sql
-- Snapshot version 2 adds each player's NFL bye week (current season trades only).
alter table tc_trade_snapshots add column if not exists snap_v int not null default 1;
