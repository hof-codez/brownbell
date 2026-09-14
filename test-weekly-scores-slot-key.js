// test-weekly-scores-slot-key.js
// Proves a real, confirmed bug and its fix: saveWeeklyScores' upsert
// previously keyed on team_id/award_type/week/sleeper_player_id -
// including the player as part of the uniqueness key. When a slot's
// player changed within a week that already had a saved row (e.g. an
// admin correction via direct SQL, bypassing the app's own in-flow
// protections), the new player's row didn't replace the old one - it
// sat alongside it, permanently orphaning the old row. This is exactly
// why a 2-player Brown Bell matchup briefly showed 3 players after a
// real correction (Shedeur Sanders' stale row never got cleaned up
// when A.J. Brown's row was written for the same slot/week).
//
// The fix: key on the SLOT itself (team_id, award_type, week,
// player_index) - there's always exactly one real answer to "who was
// credited for this slot this week," and a new player must replace any
// existing row for that slot/week, never accumulate beside it.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const SupabaseDataLayer = require('./supabase-data-layer.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;
    const supabase = createClient();

    const dataLayer = new SupabaseDataLayer();
    dataLayer.teamIdByName = { Kenyatta93: 't1' };

    // First save: this slot (main, player_index 0, week 1) is scored for
    // Shedeur Sanders - modeling the buggy state a slot could be in
    // before a correction.
    await dataLayer.saveWeeklyScores(
        { main: { Kenyatta93: { 1: { 0: 0.0 } } } },
        { main: { Kenyatta93: { 1: { 0: 'p-shedeur' } } } },
        { 'p-shedeur': { first_name: 'Shedeur', last_name: 'Sanders', position: 'QB' } },
        {}
    );

    let rows = supabase._store.weekly_scores.filter(r => r.team_id === 't1' && r.award_type === 'main' && r.week === 1);
    allPassed &= check('First save produces exactly one row for this slot', rows.length === 1);
    allPassed &= check('That row is for Shedeur Sanders', rows[0].player_name === 'Shedeur Sanders');

    // Second save: the SAME slot (player_index 0, week 1) now scored for
    // a DIFFERENT player - A.J. Brown. This must REPLACE the existing
    // row, not add a second one alongside it.
    await dataLayer.saveWeeklyScores(
        { main: { Kenyatta93: { 1: { 0: 5.6 } } } },
        { main: { Kenyatta93: { 1: { 0: 'p-ajbrown' } } } },
        { 'p-ajbrown': { first_name: 'A.J.', last_name: 'Brown', position: 'WR' } },
        {}
    );

    rows = supabase._store.weekly_scores.filter(r => r.team_id === 't1' && r.award_type === 'main' && r.week === 1);
    allPassed &= check('After a different player scores for the SAME slot/week, still exactly one row (replaced, not accumulated)', rows.length === 1);
    allPassed &= check('That one row now correctly reflects A.J. Brown, not both players', rows[0].player_name === 'A.J. Brown' && rows[0].points === 5.6);

    // A genuinely different slot (player_index 1) in the same week must
    // remain entirely unaffected - this isn't a wildcard replace-everything.
    await dataLayer.saveWeeklyScores(
        { main: { Kenyatta93: { 1: { 1: 10.0 } } } },
        { main: { Kenyatta93: { 1: { 1: 'p-barkley' } } } },
        { 'p-barkley': { first_name: 'Saquon', last_name: 'Barkley', position: 'RB' } },
        {}
    );

    rows = supabase._store.weekly_scores.filter(r => r.team_id === 't1' && r.award_type === 'main' && r.week === 1);
    allPassed &= check('A different slot in the same week adds its own row rather than colliding with slot 0', rows.length === 2);
    allPassed &= check('Exactly 2 total players for this 2-player award, never 3', new Set(rows.map(r => r.player_name)).size === 2);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
