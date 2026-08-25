// Shared by useLeagueScores and useBonusResults - the two hooks showing
// actual game scores. 60 seconds is frequent enough to feel responsive
// without hammering Supabase; the automation itself writes at most every
// 15 minutes during live windows, so this is already well ahead of the
// real data-change rate.
export const LIVE_SCORE_POLL_INTERVAL_MS = 60_000;
