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
            .select('id, display_name')
            .eq('season_id', this.seasonId);

        if (teamsError) throw new Error(`Failed to load teams: ${teamsError.message}`);

        this.teamIdByName = {};
        this.teamNameById = {};
        for (const t of teams) {
            this.teamIdByName[t.display_name] = t.id;
            this.teamNameById[t.id] = t.display_name;
        }

        return { seasonId: this.seasonId, currentWeek: season.current_week, sleeperLeagueId: season.sleeper_league_id };
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
    async saveWeeklyScores(scores, playerIds) {
        const rows = [];
        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, byWeek] of Object.entries(scores[awardType] || {})) {
                const teamId = this.teamIdByName[teamName];
                if (!teamId) continue;

                for (const [week, byIndex] of Object.entries(byWeek)) {
                    for (const [index, points] of Object.entries(byIndex)) {
                        const sleeperPlayerId = playerIds?.[awardType]?.[teamName]?.[week]?.[index];
                        if (!sleeperPlayerId) continue; // nothing to key the row on
                        rows.push({
                            team_id: teamId,
                            award_type: awardType,
                            week: Number(week),
                            sleeper_player_id: sleeperPlayerId,
                            points: points || 0
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
