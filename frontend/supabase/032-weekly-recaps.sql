-- 032-weekly-recaps.sql
-- One row per week, generated once a week's Brown Bell matchups all go
-- final (see weekBonusIsStable in update-standings.js). Deliberately a
-- single JSONB blob rather than several normalized tables - this is a
-- READ-ONLY, point-in-time snapshot meant to power a shareable public
-- link, never edited or joined against once written, so normalizing it
-- would add cost without adding anything real. Once a row exists for a
-- given week, the automation never overwrites it automatically - a link
-- someone already has shouldn't change under them later if a stat
-- correction comes in. A manual regenerate, if ever needed, is a
-- deliberate, separate action, not a side effect of a routine run.
--
-- content shape (documented here since there's no separate column to
-- read it from). Main Award gets a full matchup-based recap (it's the
-- only award with an opponent, tier, bonus, or prediction mechanic at
-- all); Next Up and Season of Boom are each a standalone season-long
-- point race per team, so their sections are deliberately smaller.
-- A "players" array is { playerName, playerPosition, points }[] - that
-- team's current duo for the award in question, for that specific week:
-- {
--   week: number,
--   main: {
--     matchupOfTheWeek: { teamA, teamB, scoreA, scoreB, winner, playersA, playersB } | null,
--     matchups: [{ teamA, teamB, scoreA, scoreB, winner, tier, bonus, playersA, playersB }, ...],
--     biggestBlowout: { teamA, teamB, scoreA, scoreB, margin, playersA, playersB } | null,
--     topScorer: { teamName, playerName, playerPosition, points } | null,
--     biggestUpset: { winner, loser, winnerProbability, scoreWinner, scoreLoser, winnerPlayers, loserPlayers } | null,
--     leaguePredictions: { record: { correct, wrong }, matchups: [{ teamA, teamB, percentA, percentB, winner, leagueCorrect }, ...] } | null,
--     standingsTop3: [{ rank, teamName, combined, seasonTotal, bonusTotal, players }, ...]
--   },
--   nextup: {
--     topScorer: { teamName, playerName, playerPosition, points } | null,
--     criticalSub: { teamName, playerName, playerPosition, points, originalName, source } | null,
--     bounceBack: { teamName, playerName, playerPosition, points, priorAverage } | null,
--     coldStreak: { teamName, playerName, playerPosition, points, priorAverage } | null,
--     positionalPowerhouse: { position, totalPoints } | null,
--     standingsTop3: [{ rank, teamName, combined, seasonTotal, bonusTotal, players }, ...]  -- bonusTotal always 0
--   },
--   boom: { same shape as nextup }
-- }

create table if not exists weekly_recaps (
    week integer primary key,
    generated_at timestamptz not null default now(),
    content jsonb not null
);

alter table weekly_recaps enable row level security;

-- Public, read-only - this is the whole point of the feature (a link
-- anyone can open without claiming a team or being logged in at all).
drop policy if exists "Public can view weekly recaps" on weekly_recaps;
create policy "Public can view weekly recaps"
    on weekly_recaps for select
    using (true);
