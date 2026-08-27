// supabase-data-layer.js
// The automation's entire read/write boundary with Supabase. update-standings.js talks
// to this module only - it never touches the Supabase client directly, and never touches
// brown-bell-data.json. Internally, the automation's substitution/injury-detection logic
// still works with the same plain teamName-keyed objects it always has; this layer's job
// is translating that to and from the normalized Supabase tables.

const { createClient } = require('@supabase/supabase-js');

class SupabaseDataLayer {
    constructor() {
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
        }
        this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        this.seasonId = null;
        this.teamIdByName = {};
        this.teamNameById = {};
    }

    // Call once per run before anything else. Loads (or fails loudly if missing) the
    // season row and the team-name <-> team-id mapping used everywhere below.
    async loadSeason(year, sleeperLeagueId) {
        const { data: season, error } = await this.supabase
            .from('seasons')
            .select('id, current_week, sleeper_league_id')
            .eq('year', year)
            .maybeSingle();

        if (error) throw new Error(`Failed to load season ${year}: ${error.message}`);
        if (!season) throw new Error(`No season row for ${year} - run seed-2026-season.js first`);

        this.seasonId = season.id;

        const { data: teams, error: teamsError } = await this.supabase
            .from('teams')
            .select('id, display_name, permanent_swaps_used, manual_privilege')
            .eq('season_id', this.seasonId);

        if (teamsError) throw new Error(`Failed to load teams: ${teamsError.message}`);

        this.teamIdByName = {};
        this.teamNameById = {};
        this.teamSwapStateByName = {};
        for (const t of teams) {
            this.teamIdByName[t.display_name] = t.id;
            this.teamNameById[t.id] = t.display_name;
            this.teamSwapStateByName[t.display_name] = {
                permanentSwapsUsed: t.permanent_swaps_used,
                manualPrivilege: t.manual_privilege
            };
        }

        return { seasonId: this.seasonId, currentWeek: season.current_week, sleeperLeagueId: season.sleeper_league_id };
    }

    // Season-long swap budget for a team - read from the cache loadSeason
    // already populated, no extra round trip.
    getTeamSwapState(teamName) {
        return this.teamSwapStateByName[teamName] || { permanentSwapsUsed: 0, manualPrivilege: true };
    }

    async updateTeamSwapState(teamName, { permanentSwapsUsed, manualPrivilege }) {
        const teamId = this.teamIdByName[teamName];
        if (!teamId) throw new Error(`Unknown team: ${teamName}`);

        const { error } = await this.supabase
            .from('teams')
            .update({ permanent_swaps_used: permanentSwapsUsed, manual_privilege: manualPrivilege })
            .eq('id', teamId);

        if (error) throw new Error(`Failed to update swap state for ${teamName}: ${error.message}`);
        this.teamSwapStateByName[teamName] = { permanentSwapsUsed, manualPrivilege };
    }

    async setCurrentWeek(week) {
        const { error } = await this.supabase
            .from('seasons')
            .update({ current_week: week })
            .eq('id', this.seasonId);
        if (error) throw new Error(`Failed to update current_week: ${error.message}`);
    }

    // Returns { main: { teamName: [ {name, position, experience?, sleeperId?}, ... ] }, nextup: {...} }
    // Teams with no duo rows yet simply don't appear - an owner hasn't set a lineup, so
    // that team doesn't participate in that award until they do. No placeholder needed.
    async loadKnownDuos() {
        const { data: duos, error } = await this.supabase
            .from('duos')
            .select('team_id, award_type, player_index, player_name, player_position, sleeper_player_id, experience')
            .in('team_id', Object.values(this.teamIdByName));

        if (error) throw new Error(`Failed to load duos: ${error.message}`);

        const knownDuos = { main: {}, nextup: {} };
        for (const d of duos) {
            const teamName = this.teamNameById[d.team_id];
            if (!teamName) continue;

            knownDuos[d.award_type][teamName] = knownDuos[d.award_type][teamName] || [null, null];
            knownDuos[d.award_type][teamName][d.player_index] = {
                name: d.player_name,
                position: d.player_position,
                sleeperId: d.sleeper_player_id || undefined,
                ...(d.experience ? { experience: d.experience } : {})
            };
        }

        // Drop any team left with a null slot (an incomplete duo isn't valid to run against)
        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, duo] of Object.entries(knownDuos[awardType])) {
                if (!duo[0] || !duo[1]) delete knownDuos[awardType][teamName];
            }
        }

        return knownDuos;
    }

    // Raw duo rows, ungrouped and including incomplete slots - used by the
    // automation's per-slot processing, which needs to see (and potentially
    // fill) an empty slot, not just complete pairs like loadKnownDuos() returns.
    async loadDuoRows() {
        const { data, error } = await this.supabase
            .from('duos')
            .select('id, team_id, award_type, player_index, player_name, player_position, sleeper_player_id, source, original_sleeper_player_id')
            .in('team_id', Object.values(this.teamIdByName));

        if (error) throw new Error(`Failed to load duo rows: ${error.message}`);

        return data.map(row => ({
            rowId: row.id,
            teamName: this.teamNameById[row.team_id],
            awardType: row.award_type,
            playerIndex: row.player_index,
            playerName: row.player_name,
            playerPosition: row.player_position,
            sleeperPlayerId: row.sleeper_player_id,
            source: row.source,
            originalSleeperPlayerId: row.original_sleeper_player_id
        })).filter(row => row.teamName); // drop rows for a team not in this season's roster
    }

    // Batch-updates injury_status for every currently-set duo slot, called once
    // per automation run - purely a display field, never read by any
    // substitution/scoring logic (that always reads live Sleeper data directly).
    async updateDuoInjuryStatuses(updates) {
        if (!updates || updates.length === 0) return;

        const results = await Promise.all(updates.map(({ rowId, injuryStatus }) =>
            this.supabase.from('duos').update({ injury_status: injuryStatus }).eq('id', rowId)
        ));

        const failed = results.find(r => r.error);
        if (failed) console.error(`Failed to update some duo injury statuses (non-fatal): ${failed.error.message}`);
    }

    // Direct write to duos - the automation's own auto-fill/lock-freeze/revert
    // path. Owner-driven writes go through set-duo (the Edge Function), not here.
    async upsertDuoSlot({ teamName, awardType, playerIndex, playerName, playerPosition, sleeperPlayerId, source, originalSleeperPlayerId }) {
        const teamId = this.teamIdByName[teamName];
        if (!teamId) throw new Error(`Unknown team: ${teamName}`);

        const row = {
            team_id: teamId,
            award_type: awardType,
            player_index: playerIndex,
            player_name: playerName,
            player_position: playerPosition,
            sleeper_player_id: sleeperPlayerId,
            source
        };
        if (originalSleeperPlayerId !== undefined) row.original_sleeper_player_id = originalSleeperPlayerId;

        const { error } = await this.supabase
            .from('duos')
            .upsert(row, { onConflict: 'team_id,award_type,player_index' });

        if (error) throw new Error(`Failed to upsert duo slot for ${teamName}/${awardType}/${playerIndex}: ${error.message}`);
    }

    // Stamps original_sleeper_player_id without touching anything else - the
    // one-time freeze that happens the moment a slot's occupant locks in.
    async freezeOriginalPlayer(rowId, sleeperPlayerId) {
        const { error } = await this.supabase
            .from('duos')
            .update({ original_sleeper_player_id: sleeperPlayerId })
            .eq('id', rowId);
        if (error) throw new Error(`Failed to freeze original player: ${error.message}`);
    }

    // Leaves a slot genuinely empty - the "1st permanent departure, awaiting
    // owner pick" case. The frontend already renders a missing row as "Not set yet".
    async clearDuoSlot(teamName, awardType, playerIndex) {
        const teamId = this.teamIdByName[teamName];
        if (!teamId) throw new Error(`Unknown team: ${teamName}`);

        const { error } = await this.supabase
            .from('duos')
            .delete()
            .eq('team_id', teamId)
            .eq('award_type', awardType)
            .eq('player_index', playerIndex);

        if (error) throw new Error(`Failed to clear duo slot for ${teamName}: ${error.message}`);
    }

    // Pure history log now - substitutions no longer determines who's
    // currently playing (duos does), this just records that a change happened.
    // Never throws - a failed log entry shouldn't take down the actual change.
    // IMPORTANT: updateAllScores still resolves "who was playing" for past
    // weeks by searching this table for an entry with end_week IS NULL - see
    // the matching note in update-standings.js. That lookup is only reliable
    // if at most one such entry ever exists per team/award/player_index at a
    // time, regardless of whether it was the owner or the automation that
    // wrote it last. So every write here closes out any prior open entry for
    // this exact slot FIRST, mirroring the same close-out set-duo does on
    // its own writes - the two paths have to agree on this or the same
    // ambiguity bug reappears from whichever direction wasn't covered.
    async logSubstitution({ teamName, awardType, playerIndex, originalName, originalPosition, substituteName, substitutePlayerId, substitutePosition, week, source, reason, noReplacementAvailable }) {
        const teamId = this.teamIdByName[teamName];
        if (!teamId) {
            console.warn(`Skipping substitution log - unknown team: ${teamName}`);
            return;
        }

        const { error: closeOutError } = await this.supabase
            .from('substitutions')
            .update({ end_week: Math.max(0, week - 1), active: false })
            .eq('team_id', teamId)
            .eq('award_type', awardType)
            .eq('player_index', playerIndex)
            .is('end_week', null);
        if (closeOutError) {
            console.error(`Failed to close out prior substitution entries (non-fatal): ${closeOutError.message}`);
        }

        const { error } = await this.supabase.from('substitutions').insert({
            team_id: teamId,
            award_type: awardType,
            player_index: playerIndex,
            original_name: originalName,
            original_position: originalPosition,
            substitute_name: substituteName,
            substitute_player_id: substitutePlayerId,
            substitute_position: substitutePosition,
            start_week: week,
            end_week: null,
            active: true,
            source,
            reason,
            no_replacement_available: noReplacementAvailable || false
        });

        if (error) console.error(`Failed to log substitution (non-fatal): ${error.message}`);
    }

    // Returns substitutions in the same shape the automation has always used internally,
    // with an extra _id field (used to know which rows to UPDATE vs INSERT on save).
    async loadSubstitutions() {
        const { data, error } = await this.supabase
            .from('substitutions')
            .select('*')
            .in('team_id', Object.values(this.teamIdByName));

        if (error) throw new Error(`Failed to load substitutions: ${error.message}`);

        return data.map(row => ({
            _id: row.id,
            teamName: this.teamNameById[row.team_id],
            playerIndex: row.player_index,
            awardType: row.award_type,
            originalName: row.original_name,
            originalPosition: row.original_position,
            substituteName: row.substitute_name,
            substitutePlayerId: row.substitute_player_id,
            substitutePosition: row.substitute_position,
            startWeek: row.start_week,
            endWeek: row.end_week,
            active: row.active,
            autoGenerated: row.source === 'auto',
            reason: row.reason,
            noReplacementAvailable: row.no_replacement_available,
            isTemporaryByeReplacement: row.reason?.includes('Temporary Bye Week Replacement') || false
        }));
    }

    // Splits on presence of _id: existing rows (possibly mutated, e.g. endWeek closed
    // out) get updated in place; brand new substitution objects get inserted.
    async saveSubstitutions(substitutions) {
        const updates = substitutions.filter(s => s._id);
        const inserts = substitutions.filter(s => !s._id);

        for (const s of updates) {
            const { error } = await this.supabase
                .from('substitutions')
                .update({ end_week: s.endWeek, active: s.endWeek ? false : s.active })
                .eq('id', s._id);
            if (error) throw new Error(`Failed to update substitution ${s._id}: ${error.message}`);
        }

        if (inserts.length > 0) {
            const rows = inserts.map(s => ({
                team_id: this.teamIdByName[s.teamName],
                award_type: s.awardType,
                player_index: s.playerIndex,
                original_name: s.originalName,
                original_position: s.originalPosition,
                substitute_name: s.substituteName,
                substitute_player_id: s.substitutePlayerId,
                substitute_position: s.substitutePosition,
                start_week: s.startWeek,
                end_week: s.endWeek,
                active: s.active,
                source: s.autoGenerated === false ? 'owner' : 'auto',
                reason: s.reason,
                no_replacement_available: s.noReplacementAvailable || false
            })).filter(r => r.team_id); // drop rows for unknown teams rather than error the whole batch

            const { error } = await this.supabase.from('substitutions').insert(rows);
            if (error) throw new Error(`Failed to insert substitutions: ${error.message}`);
        }
    }

    // scores/playerIds shape: { [awardType]: { [teamName]: { [week]: { [index]: value } } } }
    // (this matches updateAllScores()'s existing internal structure - see update-standings.js)
    async saveWeeklyScores(scores, playerIds, playersData, wasBye) {
        const rows = [];
        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, byWeek] of Object.entries(scores[awardType] || {})) {
                const teamId = this.teamIdByName[teamName];
                if (!teamId) continue;

                for (const [week, byIndex] of Object.entries(byWeek)) {
                    for (const [index, points] of Object.entries(byIndex)) {
                        const sleeperPlayerId = playerIds?.[awardType]?.[teamName]?.[week]?.[index];
                        if (!sleeperPlayerId) continue; // nothing to key the row on

                        // Captured at write time, not resolved later from duos, so
                        // past weeks stay accurate even after a player is swapped.
                        const player = playersData?.[sleeperPlayerId];
                        const playerName = player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() : null;

                        rows.push({
                            team_id: teamId,
                            award_type: awardType,
                            week: Number(week),
                            sleeper_player_id: sleeperPlayerId,
                            points: points || 0,
                            player_name: playerName || null,
                            player_position: player?.position || null,
                            was_bye: !!wasBye?.[awardType]?.[teamName]?.[week]?.[index]
                        });
                    }
                }
            }
        }

        if (rows.length === 0) return;

        const { error } = await this.supabase
            .from('weekly_scores')
            .upsert(rows, { onConflict: 'team_id,award_type,week,sleeper_player_id' });

        if (error) throw new Error(`Failed to save weekly scores: ${error.message}`);
    }

    // Brown Bell weekly bonus matchup results - one row per team per week
    // (a matchup between A and B produces 2 rows, one from each side).
    // resultsByTeamName: { teamName: { opponent, teamScore, opponentScore, outcome, tier, bonusPoints } }
    async saveBonusResults(week, resultsByTeamName, isFinalByTeamName = {}) {
        const rows = [];
        for (const [teamName, result] of Object.entries(resultsByTeamName)) {
            const teamId = this.teamIdByName[teamName];
            if (!teamId) continue;
            const opponentId = result.opponent ? this.teamIdByName[result.opponent] : null;

            rows.push({
                team_id: teamId,
                week,
                opponent_team_id: opponentId || null,
                team_score: result.teamScore,
                opponent_score: result.opponentScore,
                outcome: result.outcome,
                tier: result.tier,
                bonus_points: result.bonusPoints,
                is_final: !!isFinalByTeamName[teamName]
            });
        }

        if (rows.length === 0) return;

        // Detect stat corrections: if a row already exists AND was already
        // final AND the numbers about to be written actually differ, that's
        // Sleeper correcting something after the fact (commonly settled the
        // Tuesday after Monday Night Football, but this catches it whenever
        // it actually happens) - snapshot the before/after BEFORE
        // overwriting, so the change is visible rather than silently lost.
        const teamIds = rows.map(r => r.team_id);
        const { data: existingRows, error: existingError } = await this.supabase
            .from('bonus_results')
            .select('team_id, team_score, outcome, tier, bonus_points, is_final')
            .eq('week', week)
            .in('team_id', teamIds);

        if (existingError) {
            console.error(`Failed to check for stat corrections (non-fatal, proceeding with write): ${existingError.message}`);
        } else {
            const existingByTeamId = new Map((existingRows || []).map(r => [r.team_id, r]));
            const corrections = [];

            for (const row of rows) {
                const existing = existingByTeamId.get(row.team_id);
                if (!existing || !existing.is_final) continue; // nothing to compare, or wasn't final yet - not a correction

                const changed = Number(existing.team_score) !== Number(row.team_score) ||
                    existing.outcome !== row.outcome ||
                    existing.tier !== row.tier ||
                    Number(existing.bonus_points) !== Number(row.bonus_points);

                if (changed) {
                    corrections.push({
                        team_id: row.team_id,
                        week,
                        original_team_score: existing.team_score,
                        corrected_team_score: row.team_score,
                        original_outcome: existing.outcome,
                        corrected_outcome: row.outcome,
                        original_tier: existing.tier,
                        corrected_tier: row.tier,
                        original_bonus_points: existing.bonus_points,
                        corrected_bonus_points: row.bonus_points
                    });
                }
            }

            if (corrections.length > 0) {
                console.warn(`Detected ${corrections.length} stat correction(s) for week ${week} - logging before overwriting`);
                const { error: correctionError } = await this.supabase.from('bonus_result_corrections').insert(corrections);
                if (correctionError) {
                    console.error(`Failed to log stat correction(s) (non-fatal, proceeding with write): ${correctionError.message}`);
                }
            }
        }

        const { error } = await this.supabase
            .from('bonus_results')
            .upsert(rows, { onConflict: 'team_id,week' });

        if (error) throw new Error(`Failed to save bonus results: ${error.message}`);
    }

    // Companion to saveBonusResults - removes any bonus_results rows for a
    // week that turns out to have no real score data. Needed because a
    // week's bonus results might already have been (incorrectly) written by
    // an earlier run before this check existed, or before Sleeper had
    // posted any stats yet - this cleans that up on the next run rather
    // than leaving stale "everyone tied 0-0" results sitting there.
    async clearBonusResultsForWeek(week) {
        const { error } = await this.supabase.from('bonus_results').delete().eq('week', week);
        if (error) console.error(`Failed to clear stale bonus results for week ${week} (non-fatal): ${error.message}`);
    }

    async loadRosterChanges() {
        const { data, error } = await this.supabase
            .from('roster_changes')
            .select('team_id, award_type, player_index, change_week, reason')
            .in('team_id', Object.values(this.teamIdByName));
        if (error) throw new Error(`Failed to load roster changes: ${error.message}`);
        return data.map(r => ({
            teamName: this.teamNameById[r.team_id],
            awardType: r.award_type,
            playerIndex: r.player_index,
            changeWeek: r.change_week,
            reason: r.reason
        }));
    }

    async loadManagerChanges() {
        const { data, error } = await this.supabase
            .from('manager_changes')
            .select('team_id, previous_manager, change_week, reason')
            .in('team_id', Object.values(this.teamIdByName));
        if (error) throw new Error(`Failed to load manager changes: ${error.message}`);

        const result = {};
        for (const r of data) {
            const teamName = this.teamNameById[r.team_id];
            if (teamName) result[teamName] = { previousManager: r.previous_manager, changeWeek: r.change_week, reason: r.reason };
        }
        return result;
    }

    async loadScheduleSnapshot(week) {
        const { data, error } = await this.supabase
            .from('schedule_snapshots')
            .select('teams, captured_at')
            .eq('season_id', this.seasonId)
            .eq('week', week)
            .maybeSingle();
        if (error) throw new Error(`Failed to load schedule snapshot: ${error.message}`);
        return data ? { teams: data.teams, capturedAt: data.captured_at } : null;
    }

    async saveScheduleSnapshot(week, teams, capturedAt) {
        const { error } = await this.supabase
            .from('schedule_snapshots')
            .upsert({ season_id: this.seasonId, week, teams, captured_at: capturedAt }, { onConflict: 'season_id,week' });
        if (error) throw new Error(`Failed to save schedule snapshot: ${error.message}`);
    }

    async loadScheduleChanges(week) {
        const { data, error } = await this.supabase
            .from('schedule_changes')
            .select('changes')
            .eq('season_id', this.seasonId)
            .eq('week', week)
            .order('detected_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(`Failed to load schedule changes: ${error.message}`);
        return data ? data.changes : [];
    }

    async saveScheduleChanges(week, changes) {
        if (!changes || changes.length === 0) return;
        const { error } = await this.supabase
            .from('schedule_changes')
            .insert({ season_id: this.seasonId, week, changes });
        if (error) throw new Error(`Failed to save schedule changes: ${error.message}`);
    }
}

module.exports = SupabaseDataLayer;
