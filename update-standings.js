// update-standings.js - GitHub Actions automation script
const https = require('https');
const SupabaseDataLayer = require('./supabase-data-layer');

class BrownBellAutomator {
    constructor(leagueId) {
        this.leagueId = leagueId;
        this.playersData = null;
        this.leagueData = null;
        this.cachedSchedule = {};
        this.dataLayer = new SupabaseDataLayer();

        // Populated from Supabase via loadKnownDuos() before any run - no hardcoded
        // team/player data lives in this file. See supabase-data-layer.js.
        this.knownDuos = { main: {}, nextup: {} };
        this.inactiveTeams = {};
        this.managerChanges = {};

        // Exclusion list: prevent auto-substitutions for specific scenarios
        this.substitutionExclusions = [];
    }

    async fetchJson(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; BrownBellAutomation/2.0; +https://github.com/hof-codez/brownbell)',
                    'Accept': 'application/json'
                }
            };
            https.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    // ESPN uses a couple of team abbreviations that differ from the ones used elsewhere in
    // this file (knownDuos, roster/player data, etc). Normalize here.
    static ESPN_ABBR_FIX = { WSH: 'WAS' };

    // Full 32-team list, in the same abbreviation convention used elsewhere in this file.
    // Used to detect byes explicitly, since ESPN's scoreboard simply omits a bye team
    // rather than listing them - a team missing from `events` is otherwise
    // indistinguishable from "the fetch failed."
    static ALL_NFL_TEAMS = [
        'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
        'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
        'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'
    ];

    async fetchNFLSchedule(week) {
        console.log(`Fetching NFL schedule for Week ${week}...`);

        try {
            const season = process.env.NFL_SEASON_YEAR || '2026';
            // ESPN's public scoreboard endpoint - structured JSON, kept live in sync with
            // actual broadcast schedule (flex moves, weather reschedules, etc), unlike the
            // old approach of regex-scraping the NFL.com operations page HTML, which was
            // fragile and hardcoded to a single season's page.
            const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=${season}`;
            const data = await this.fetchJson(url);

            const weekSchedule = this.parseEspnSchedule(data);

            // Cache it for this run only (a fresh process runs on every checkpoint, so this
            // never goes stale across checkpoints - each run re-fetches live).
            this.cachedSchedule = this.cachedSchedule || {};
            this.cachedSchedule[week] = weekSchedule;

            console.log(`Successfully fetched schedule for Week ${week} - ${Object.keys(weekSchedule).length} teams`);
            return weekSchedule;

        } catch (error) {
            console.warn(`Failed to fetch NFL schedule: ${error.message}`);
            console.log('Falling back to manual schedule data');
            return null;
        }
    }

    parseEspnSchedule(espnData) {
        const schedule = {};
        const events = (espnData && espnData.events) || [];
        const teamsWithGames = new Set();

        for (const event of events) {
            const competition = event.competitions && event.competitions[0];
            if (!competition) continue;

            const gameDate = new Date(event.date); // ESPN returns ISO 8601 UTC already
            if (isNaN(gameDate.getTime())) continue;

            const competitors = competition.competitors || [];
            const teams = competitors
                .map(c => {
                    let abbr = c.team && c.team.abbreviation;
                    if (abbr && BrownBellAutomator.ESPN_ABBR_FIX[abbr]) {
                        abbr = BrownBellAutomator.ESPN_ABBR_FIX[abbr];
                    }
                    return abbr;
                })
                .filter(Boolean);

            if (teams.length !== 2) continue;

            const [team1, team2] = teams;
            const statusState = competition.status?.type?.state; // 'pre' | 'in' | 'post'
            const statusDetail = competition.status?.type?.shortDetail;

            // Venue country tells us if this is an international game (London, Berlin,
            // Sao Paulo, Madrid, etc) - live-derived instead of a hand-maintained list.
            const venue = competition.venue;
            const venueCountry = venue?.address?.country;
            const isInternational = !!venueCountry && !['USA', 'US', 'United States'].includes(venueCountry);
            const venueInfo = venue ? {
                name: venue.fullName,
                city: venue.address?.city,
                country: venueCountry || 'USA'
            } : null;

            const gameInfo = { date: gameDate, opponent: null, status: statusState, statusDetail, international: isInternational, venue: venueInfo };

            schedule[team1] = { ...gameInfo, opponent: team2 };
            schedule[team2] = { ...gameInfo, opponent: team1 };
            teamsWithGames.add(team1);
            teamsWithGames.add(team2);
        }

        // Any team not found in this week's events is on bye - mark it explicitly rather
        // than leaving it absent, which hasPlayerGameStarted() would otherwise mistake for
        // a failed fetch and fall back to a much cruder heuristic.
        for (const team of BrownBellAutomator.ALL_NFL_TEAMS) {
            if (!teamsWithGames.has(team)) {
                schedule[team] = { date: null, opponent: null, status: 'bye', statusDetail: 'BYE', international: false, venue: null };
            }
        }

        return schedule;
    }

    async isPlayerOnBye(playerId, week) {
        const player = this.playersData[playerId];
        if (!player || !player.team) return false;

        // Live schedule data (same source hasPlayerGameStarted uses) instead of a
        // hand-maintained per-season bye table - see parseEspnSchedule's explicit
        // bye-marking for any team missing from that week's events.
        if (!this.cachedSchedule || !this.cachedSchedule[week]) {
            await this.fetchNFLSchedule(week);
        }

        const teamGame = this.cachedSchedule?.[week]?.[player.team];
        const onBye = !!teamGame && teamGame.date === null;

        if (onBye) {
            console.log(`${player.first_name} ${player.last_name} (${player.team}) is on bye week ${week}`);
        }

        return onBye;
    }

    async hasPlayerGameStarted(playerId, week) {
        const player = this.playersData[playerId];
        if (!player || !player.team) return false;

        const now = new Date();
        const nflTeam = player.team;

        // Try to get cached schedule first
        if (!this.cachedSchedule || !this.cachedSchedule[week]) {
            await this.fetchNFLSchedule(week);
        }

        // Use fetched schedule if available
        const weekSchedule = this.cachedSchedule?.[week];

        if (weekSchedule && weekSchedule[nflTeam]) {
            const teamGame = weekSchedule[nflTeam];

            // If team is on bye
            if (teamGame.date === null) {
                return false;
            }

            // Check if game has started
            const gameHasStarted = now >= teamGame.date;

            if (gameHasStarted) {
                console.log(`${nflTeam} game started: ${teamGame.date.toISOString()}`);
            }

            return gameHasStarted;
        }

        // Fallback: Conservative approach if schedule fetch failed
        console.log(`No schedule data for ${nflTeam} Week ${week}, using fallback`);
        const dayOfWeek = now.getDay();
        return (dayOfWeek === 1 || dayOfWeek === 2); // Mon/Tue = week over
    }

    // Returns minutes until this player's NFL team's game kicks off
    // (negative if already started), the string 'bye' if their team is
    // confirmed on bye this week, or null if schedule data genuinely
    // couldn't be determined (fetch failed, player unresolvable). These
    // three cases are kept distinct on purpose - a confirmed bye should
    // NOT be treated as "ineligible" by the kickoff-timing rule below (a
    // bye player hasn't played, there's nothing to protect against), but
    // genuinely unknown schedule data should be conservative and block a
    // pick rather than assume it's safe.
    async getMinutesUntilKickoff(playerId, week) {
        const player = this.playersData[playerId];
        if (!player || !player.team) return null;

        if (!this.cachedSchedule || !this.cachedSchedule[week]) {
            await this.fetchNFLSchedule(week);
        }

        const teamGame = this.cachedSchedule?.[week]?.[player.team];
        if (!teamGame) return null;
        if (teamGame.date === null) return 'bye';

        const now = new Date();
        return (teamGame.date.getTime() - now.getTime()) / 60000;
    }

    // Universal kickoff-timing eligibility rule: a candidate can only be
    // subbed in - by an owner OR by auto-sub - if their own game hasn't
    // started (with `bufferMinutes` as a safety margin before the exact
    // kickoff moment). This prevents anyone from picking a replacement
    // based on stats that have already happened or are already live.
    // Currently scoped to Season of Boom only - Main Award and Next Up
    // retrofit is separate, deliberately deferred work.
    async isEligibleForSub(playerId, week, bufferMinutes) {
        const minutesUntilKickoff = await this.getMinutesUntilKickoff(playerId, week);
        if (minutesUntilKickoff === 'bye') return true; // confirmed bye - not excluded by this rule specifically
        if (minutesUntilKickoff === null) return false; // genuinely unknown - be conservative
        return minutesUntilKickoff > bufferMinutes;
    }

    // Weekly check: compares this week's live schedule against the snapshot taken earlier
    // in the week and flags any game whose kickoff time moved - flex scheduling, weather
    // reschedule, etc. This is purely for visibility - hasPlayerGameStarted() already
    // fetches the live schedule fresh on every checkpoint, so locking behavior is correct
    // regardless. This just surfaces the change so it doesn't have to be noticed by
    // digging through Action logs.
    async checkForScheduleChanges(week, previousSnapshot) {
        const currentSchedule = await this.fetchNFLSchedule(week);
        if (!currentSchedule) {
            return { snapshot: previousSnapshot || null, changes: [] };
        }

        const changes = [];

        if (previousSnapshot) {
            for (const [team, currentGame] of Object.entries(currentSchedule)) {
                const previousGame = previousSnapshot[team];
                if (!previousGame) continue; // team wasn't in the prior snapshot (bye -> game, etc)

                const prevDate = previousGame.date ? new Date(previousGame.date) : null;
                const currDate = currentGame.date;

                // Bye -> scheduled, or scheduled -> bye
                if (!prevDate && currDate) {
                    changes.push({ team, opponent: currentGame.opponent, type: 'ADDED_FROM_BYE', newTime: currDate.toISOString() });
                    continue;
                }
                if (prevDate && !currDate) {
                    changes.push({ team, opponent: previousGame.opponent, type: 'MOVED_TO_BYE', previousTime: prevDate.toISOString() });
                    continue;
                }
                if (!prevDate || !currDate) continue;

                const diffMinutes = Math.abs(currDate.getTime() - prevDate.getTime()) / 60000;
                if (diffMinutes >= 15) { // ignore trivial rounding, catch real flex/reschedule moves
                    changes.push({
                        team,
                        opponent: currentGame.opponent,
                        type: 'TIME_CHANGED',
                        previousTime: prevDate.toISOString(),
                        newTime: currDate.toISOString(),
                        diffMinutes: Math.round(diffMinutes)
                    });
                }
            }

            if (changes.length > 0) {
                console.warn(`SCHEDULE CHANGE DETECTED for Week ${week}:`);
                changes.forEach(c => {
                    if (c.type === 'TIME_CHANGED') {
                        console.warn(`   ${c.team} vs ${c.opponent}: ${c.previousTime} -> ${c.newTime} (moved ${c.diffMinutes} min)`);
                    } else {
                        console.warn(`   ${c.team}: ${c.type}`);
                    }
                });
            } else {
                console.log(`No schedule changes detected for Week ${week} since last snapshot`);
            }
        }

        // Store as plain serializable objects (Date -> ISO string) for the JSON snapshot
        const serializedSnapshot = {};
        for (const [team, game] of Object.entries(currentSchedule)) {
            serializedSnapshot[team] = {
                date: game.date ? game.date.toISOString() : null,
                opponent: game.opponent,
                status: game.status
            };
        }

        return { snapshot: serializedSnapshot, changes };
    }

    async initializeLeagueData() {
        console.log('Fetching league data...');

        const [league, rosters, users, players] = await Promise.all([
            this.fetchJson(`https://api.sleeper.app/v1/league/${this.leagueId}`),
            this.fetchJson(`https://api.sleeper.app/v1/league/${this.leagueId}/rosters`),
            this.fetchJson(`https://api.sleeper.app/v1/league/${this.leagueId}/users`),
            this.fetchJson('https://api.sleeper.app/v1/players/nfl')
        ]);

        // Create user lookup map
        const userMap = {};
        users.forEach(user => {
            userMap[user.user_id] = user.display_name || user.username || `User ${user.user_id}`;
        });

        this.leagueData = { league, rosters, users, userMap };
        this.playersData = players;

        console.log(`Connected to league: ${league.name}`);
    }

    async getCurrentWeek() {
        // NFL 2026 season starts Wednesday, September 9, 2026.
        // NOTE: this date needs updating every season - it's only used as a fallback
        // when Sleeper's own league.leg isn't yet reporting a valid week (e.g. before
        // the season has started), so an out-of-date value here mostly just affects
        // preseason runs, not in-season accuracy.
        const seasonStart = new Date('2026-09-09T00:00:00Z');
        const now = new Date();

        // Calculate days since season start
        const daysSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000));

        // Each NFL week starts on Thursday and runs 7 days
        // Week transitions happen every Thursday
        let calculatedWeek = Math.floor(daysSinceStart / 7) + 1;

        // Cap between 1 and 18 (NFL regular season)
        calculatedWeek = Math.max(1, Math.min(18, calculatedWeek));

        // Prefer Sleeper's own live league.leg when it's reporting a real in-season
        // value - it's the actual source of truth, not a date calculation.
        const sleeperWeek = this.leagueData?.league?.leg;
        if (sleeperWeek && sleeperWeek >= 1 && sleeperWeek <= 18) {
            console.log(`Using Sleeper week: ${sleeperWeek}, Calculated week: ${calculatedWeek}`);
            return sleeperWeek;
        }

        console.log(`Using calculated week: ${calculatedWeek} (days since start: ${daysSinceStart})`);
        return calculatedWeek;
    }

    async getWeeklyScores(week) {
        console.log(`Fetching scores for week ${week}...`);

        try {
            const matchups = await this.fetchJson(
                `https://api.sleeper.app/v1/league/${this.leagueId}/matchups/${week}`
            );

            const allPlayerScores = {};
            matchups.forEach(matchup => {
                if (matchup.players_points) {
                    Object.entries(matchup.players_points).forEach(([playerId, points]) => {
                        allPlayerScores[playerId] = parseFloat(points) || 0;
                    });
                }
            });

            return allPlayerScores;
        } catch (error) {
            console.warn(`Could not fetch scores for week ${week}:`, error.message);
            return {};
        }
    }

    findPlayerInRoster(originalPlayer, roster, allowTradedPlayers = false) {
        // Prefer the reliable Sleeper ID directly over fuzzy name matching,
        // whenever the duo entry actually has one - true for any pick made
        // through the picker. The fuzzy matching below (including the
        // global, entire-player-pool search when allowTradedPlayers is set)
        // exists only for the rare legacy case where a row somehow lacks an
        // ID - it should never be the first resort when a reliable one is
        // already sitting right there, since name matching can genuinely
        // pick the wrong person (shared last names, suffixes, etc).
        if (originalPlayer.sleeperId && this.playersData[originalPlayer.sleeperId]) {
            return originalPlayer.sleeperId;
        }

        if (!roster || !roster.players) return null;

        // FIRST: Try to find player on current roster (normal case)
        const playerId = roster.players.find(playerId => {
            const player = this.playersData[playerId];
            if (!player) return false;

            const playerFullName = `${player.first_name || ''} ${player.last_name || ''}`.trim().toLowerCase();
            const originalName = originalPlayer.name.toLowerCase();

            // Exact match first
            if (playerFullName === originalName) return true;

            // Handle common name variations
            const nameVariations = [
                originalName,
                originalName.replace('devaughn', 'devaughn'),
                originalName.replace('vele', 'vele')
            ];

            if (nameVariations.some(variation => playerFullName === variation)) return true;

            // Name similarity check
            const playerParts = playerFullName.split(' ');
            const originalParts = originalName.split(' ');

            if (playerParts.length >= 2 && originalParts.length >= 2) {
                const playerLastName = playerParts[playerParts.length - 1];
                const originalLastName = originalParts[originalParts.length - 1];
                const playerFirstName = playerParts[0];
                const originalFirstName = originalParts[0];

                return playerLastName === originalLastName &&
                    (playerFirstName.startsWith(originalFirstName.charAt(0)) ||
                        originalFirstName.startsWith(playerFirstName.charAt(0)));
            }

            return false;
        });

        // If found on current roster, return it
        if (playerId) {
            return playerId;
        }

        // SECOND: If allowTradedPlayers is true and not found on roster,
        // search ALL players globally (for historical/traded players)
        if (allowTradedPlayers) {
            const tradedPlayerId = Object.keys(this.playersData).find(id => {
                const player = this.playersData[id];
                if (!player) return false;

                const playerFullName = `${player.first_name || ''} ${player.last_name || ''}`.trim().toLowerCase();
                const originalName = originalPlayer.name.toLowerCase();

                // Use same matching logic
                if (playerFullName === originalName) return true;

                const nameVariations = [
                    originalName,
                    originalName.replace('devaughn', 'devaughn'),
                    originalName.replace('vele', 'vele')
                ];

                if (nameVariations.some(variation => playerFullName === variation)) return true;

                const playerParts = playerFullName.split(' ');
                const originalParts = originalName.split(' ');

                if (playerParts.length >= 2 && originalParts.length >= 2) {
                    const playerLastName = playerParts[playerParts.length - 1];
                    const originalLastName = originalParts[originalParts.length - 1];
                    const playerFirstName = playerParts[0];
                    const originalFirstName = originalParts[0];

                    return playerLastName === originalLastName &&
                        (playerFirstName.startsWith(originalFirstName.charAt(0)) ||
                            originalFirstName.startsWith(playerFirstName.charAt(0)));
                }

                return false;
            });

            return tradedPlayerId || null;
        }

        // Not found and not allowing traded players
        return null;
    }

    async detectInjuries(week) {
        console.log('🔍 Detecting player injuries...');

        const weekScores = await this.getWeeklyScores(week);
        const injuries = { main: {}, nextup: {} };

        for (const awardType of ['main', 'nextup']) {
            const duos = this.knownDuos[awardType];

            for (const [teamName, originalDuo] of Object.entries(duos)) {
                const roster = this.leagueData.rosters.find(r =>
                    this.leagueData.userMap[r.owner_id] === teamName
                );

                if (!roster) continue;

                const teamInjuries = [];

                // CHANGED: forEach → for loop to allow await
                for (let index = 0; index < originalDuo.length; index++) {
                    const originalPlayer = originalDuo[index];
                    const playerId = this.findPlayerInRoster(originalPlayer, roster);

                    if (playerId) {
                        const player = this.playersData[playerId];

                        const playerScore = weekScores[playerId] || 0;
                        const gameStarted = await this.hasPlayerGameStarted(playerId, week);

                        console.log(`📊 ${originalPlayer.name} (${teamName}): Score=${playerScore}, Status=${player.injury_status || 'none'}, Game Started=${gameStarted}`);

                        // CRITICAL RULE: Only lock if player scored points OR their game has started
                        if (playerScore > 0 || gameStarted) {
                            console.log(`✅ ${originalPlayer.name} ${gameStarted ? 'game started' : 'scored points'} (${playerScore} pts) - CANNOT substitute`);
                            continue; // CHANGED: return → continue (to skip to next player)
                        }

                        // ... rest of existing injury detection logic

                        let injuryStatus = 'healthy';

                        if (player.injury_status) {
                            const status = player.injury_status.toLowerCase();
                            // Only substitute for OUT or DOUBTFUL - not questionable
                            if (['out', 'doubtful'].includes(status)) {
                                injuryStatus = status;
                            }
                            // IR and PUP are season-ending
                            else if (['ir', 'pup'].includes(status)) {
                                injuryStatus = 'season_ending';
                            }
                        }

                        if (injuryStatus !== 'healthy') {
                            teamInjuries.push({
                                originalPlayer,
                                playerId,
                                index,
                                status: injuryStatus
                            });
                        }
                    }
                }

                if (teamInjuries.length > 0) {
                    injuries[awardType][teamName] = teamInjuries;
                }
            }
        }

        return injuries;
    }

    async detectSubstituteInjuries(week, existingSubstitutions) {
        console.log('🔍 Checking if active substitutes are injured or dropped from roster...');
        console.log('🔍 Detecting substitute injuries for Week', week);
        console.log('📊 Checking', existingSubstitutions.length, 'existing substitutions');

        const weekScores = await this.getWeeklyScores(week);
        const injuredSubs = [];

        for (const sub of existingSubstitutions) {
            // Only check substitutions active for this week
            if (sub.startWeek > week || (sub.endWeek && sub.endWeek < week)) {
                continue;
            }

            // IMPORTANT: Include manual trade subs in bye week detection
            console.log(`Checking sub: ${sub.substituteName} for ${sub.teamName} (${sub.awardType}) - Week ${sub.startWeek}-${sub.endWeek || 'Indefinite'}, Manual Trade: ${sub.isManualSubForTrade === true}`);

            // Skip "no replacement available" markers (they have null substitutes)
            if (!sub.substituteName || !sub.substitutePlayerId) {
                continue;
            }

            // Skip duplicates - only process each unique team/player/award combo once
            const alreadyProcessed = injuredSubs.some(existing =>
                existing.teamName === sub.teamName &&
                existing.playerIndex === sub.playerIndex &&
                existing.awardType === sub.awardType
            );

            if (alreadyProcessed) {
                continue;
            }

            const awardLabel = sub.awardType === 'main' ? 'Main Award' : 'Next Up Award';
            const playerId = sub.substitutePlayerId;
            const player = this.playersData[playerId];

            if (!player) {
                console.log(`⚠️ Player data not found for ${sub.substituteName} (${sub.teamName} - ${awardLabel})`);
                continue;
            }

            // CHECK 1: Verify substitute is still on roster
            const roster = this.leagueData.rosters.find(r =>
                this.leagueData.userMap[r.owner_id] === sub.teamName
            );

            if (roster && !roster.players.includes(playerId)) {
                console.log(`🚨 SUBSTITUTE DROPPED FROM ROSTER: ${sub.substituteName} for ${sub.teamName} (${awardLabel})`);
                injuredSubs.push(sub);
                continue;
            }

            // CHECK 2: If substitute's game has started, they are locked in
            const gameStarted = await this.hasPlayerGameStarted(playerId, week);
            const playerScore = weekScores[playerId] || 0;

            if (playerScore > 0 || gameStarted) {
                console.log(`✅ Substitute ${sub.substituteName} ${gameStarted ? 'game started' : 'scored points'} (${playerScore} pts) - locked in (${sub.teamName} - ${awardLabel})`);
                continue;
            }

            // CHECK 3: Check injury status
            let isInjured = false;
            if (player.injury_status) {
                const status = player.injury_status.toLowerCase();
                if (['out', 'doubtful', 'ir', 'pup'].includes(status)) {
                    isInjured = true;
                    console.log(`🚨 SUBSTITUTE INJURED: ${sub.substituteName} (${status}) for ${sub.teamName} (${awardLabel})`);
                }
            }

            // CHECK 4: Check if on bye
            if (await this.isPlayerOnBye(playerId, week)) {
                isInjured = true;
                console.log(`🚨 SUBSTITUTE ON BYE: ${sub.substituteName} for ${sub.teamName} (${awardLabel})`);
            }

            if (isInjured) {
                injuredSubs.push(sub);
            }
        }

        // Summary log 1
        if (injuredSubs.length > 0) {
            const mainCount = injuredSubs.filter(s => s.awardType === 'main').length;
            const nextUpCount = injuredSubs.filter(s => s.awardType === 'nextup').length;
            console.log(`📋 SUBSTITUTE REPLACEMENT SUMMARY: ${mainCount} Main Award, ${nextUpCount} Next Up Award subs need replacement`);
        } else {
            console.log(`✅ All active substitutes are healthy and on roster`);
        }

        return injuredSubs;
    }

    // Main Award only - Next Up validation lives entirely in isValidNextUpCombo()
    // now (years of experience + position, checked in findSubstitute and the
    // weekly scoring loop). This function is never called for Next Up.
    validateDuoCombination(healthyPlayerPosition, substitutePosition) {
        const validCombos = ['QB+RB', 'QB+TE', 'QB+WR', 'RB+TE', 'RB+WR', 'TE+WR'];
        const newCombo = [healthyPlayerPosition, substitutePosition].sort().join('+');
        const isValid = validCombos.includes(newCombo);

        if (!isValid) {
            console.warn(`Invalid Main Award duo combination: ${healthyPlayerPosition} + ${substitutePosition}`);
        }

        return isValid;
    }

    // NEW: Enhanced validation with detailed logging
    validateSubstitution(teamName, originalDuo, injuredPlayerIndex, substitute, awardType) {
        const healthyPlayer = originalDuo.find((_, i) => i !== injuredPlayerIndex);
        const injuredPlayer = originalDuo[injuredPlayerIndex];

        // Check if substitute creates valid duo combination
        const isValidCombo = this.validateDuoCombination(healthyPlayer.position, substitute.position);

        if (!isValidCombo) {
            console.warn(`❌ INVALID SUBSTITUTION BLOCKED:
            Team: ${teamName} (${awardType})
            Trying to substitute: ${substitute.name} (${substitute.position})
            For injured: ${injuredPlayer.name} (${injuredPlayer.position})
            Healthy partner: ${healthyPlayer.name} (${healthyPlayer.position})
            Would create: ${healthyPlayer.position}+${substitute.position} (INVALID)
            Valid combos: QB+RB, QB+TE, QB+WR, RB+TE, RB+WR, TE+WR`);
            return false;
        }

        // Additional validation for Next Up Award
        if (awardType === 'nextup') {
            const yearsExp = substitute.yearsExp || 0;
            if (yearsExp > 1) {
                console.warn(`❌ NEXT UP ELIGIBILITY VIOLATION:
                Player: ${substitute.name} (${yearsExp} years experience)
                Only rookies (0 years) and 2nd year (1 year) players eligible`);
                return false;
            }
        }

        console.log(`✅ VALID SUBSTITUTION:
        Team: ${teamName} (${awardType})
        ${substitute.name} (${substitute.position}) → ${injuredPlayer.name} (${injuredPlayer.position})
        New duo: ${healthyPlayer.position}+${substitute.position}`);

        return true;
    }

    async findSubstitute(teamName, injuredPlayer, week, awardType) {
        console.log(`\n🔍 FIND SUBSTITUTE CALLED:`);
        console.log(`   Team: ${teamName}`);
        console.log(`   Injured: ${injuredPlayer.originalPlayer.name}`);
        console.log(`   Week: ${week}`);
        console.log(`   Award: ${awardType}`);

        const roster = this.leagueData.rosters.find(r =>
            this.leagueData.userMap[r.owner_id] === teamName
        );

        if (!roster) {
            console.log(`❌ No roster found for ${teamName}`);
            return null;
        }

        console.log(`✅ Roster found, ${roster.players.length} players to evaluate`);

        const originalDuo = this.knownDuos[awardType][teamName];
        if (!originalDuo || !roster.players) {
            console.log(`❌ No original duo or roster players`);
            return null;
        }

        const eligibleSubs = [];

        // For Next Up Award, determine what a substitute must NOT match
        let excludeYears = null;
        let excludePosition = null;
        if (awardType === 'nextup') {
            const healthyPlayerIndex = injuredPlayer.index === 0 ? 1 : 0;
            const healthyPlayer = originalDuo[healthyPlayerIndex];
            const healthyExperience = this.resolveNextUpExperience(healthyPlayer, roster);

            // Rule (2026): both players must be 0-3 yrs experience, and differ in
            // BOTH years of experience and position from each other.
            if (healthyExperience) {
                excludeYears = healthyExperience.years;
                excludePosition = healthyExperience.position;
            }

            console.log(`Next Up substitution: Healthy player is ${excludeYears ?? '?'} yrs / ${excludePosition ?? '?'} - substitute must differ in both`);
        }

        for (const playerId of roster.players) {
            const player = this.playersData[playerId];

            // Position eligibility depends on award type
            const validPositions = awardType === 'nextup'
                ? ['QB', 'RB', 'WR', 'TE', 'K']  // Next Up: All positions
                : ['QB', 'RB', 'WR', 'TE'];       // Main Award: no kickers, any other position pairs (except same-position)

            // DEBUG: Log every player being considered
            if (player && validPositions.includes(player.position)) {
                console.log(`Evaluating: ${player.first_name} ${player.last_name} (${playerId})`);
            }

            if (!player || !validPositions.includes(player.position)) continue;

            // Skip if this is the injured player
            if (playerId === injuredPlayer.playerId) continue;

            // Skip if injured (including PUP)
            if (player.injury_status) {
                const status = player.injury_status.toLowerCase();
                if (['out', 'doubtful', 'ir', 'pup'].includes(status)) {
                    console.log(`Skipping ${player.first_name} ${player.last_name} - injured (${status})`);
                    continue;
                }
            }

            // Skip if this player is in the Next Up duo (for Main Award)
            if (awardType === 'main' && this.isPlayerInNextUpDuo(playerId, teamName)) {
                console.log(`Skipping ${player.first_name} ${player.last_name} - reserved for Next Up Award`);
                continue;
            }

            // Skip if substitute is on bye this week
            if (await this.isPlayerOnBye(playerId, week)) {
                console.log(`Skipping ${player.first_name} ${player.last_name} - on bye week ${week}`);
                continue;
            }

            // CORRECTED: Check if THIS CANDIDATE (not the injured player) already played
            const currentWeekScores = await this.getWeeklyScores(week);

            // Check if player has played (scored points OR game has started)
            const candidateScore = currentWeekScores[playerId] || 0;
            const gameStarted = await this.hasPlayerGameStarted(playerId, week);

            if (candidateScore > 0 || gameStarted) {
                console.log(`Skipping ${player.first_name} ${player.last_name} - ${gameStarted ? 'game started' : 'scored points'} (${candidateScore} pts)`);
                continue;
            }

            const substitute = {
                id: playerId,
                name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
                position: player.position,
                yearsExp: player.years_exp || 0
            };

            // Next Up Award smart eligibility - CHECK THIS FIRST
            if (awardType === 'nextup') {
                const yearsExp = substitute.yearsExp || 0;

                // Hard filter: 4+ years experience is never Next Up eligible
                if (!this.isNextUpEligibleExperience(yearsExp)) {
                    continue;
                }

                // Must differ from the healthy player in BOTH years of experience
                // and position (2026 rule) - this also covers what used to be a
                // separate "no QB+QB" carve-out, since same-position is excluded
                // generally now, not just for quarterbacks.
                if (excludeYears !== null && yearsExp === excludeYears) {
                    console.log(`Skipping ${substitute.name} (${yearsExp} years) - same experience year as ${originalDuo[injuredPlayer.index === 0 ? 1 : 0].name}`);
                    continue;
                }
                if (excludePosition !== null && substitute.position === excludePosition) {
                    console.log(`Skipping ${substitute.name} (${substitute.position}) - same position as ${originalDuo[injuredPlayer.index === 0 ? 1 : 0].name}`);
                    continue;
                }

                console.log(`${substitute.name} is eligible: ${yearsExp} years, ${substitute.position}`);
            }

            // Validate substitution for Main Award only
            if (awardType === 'main' && !this.validateSubstitution(teamName, originalDuo, injuredPlayer.index, substitute, awardType)) {
                continue;
            }

            // Calculate average score over the last 3 weeks (or fewer, early season) -
            // an average, not a total, so a player with only 1-2 weeks of data isn't
            // penalized relative to one with a full 3-week window.
            let totalScore = 0;
            let weeksCounted = 0;
            for (let w = Math.max(1, week - 2); w <= week; w++) {
                const weekScores = await this.getWeeklyScores(w);
                if (weekScores[playerId] !== undefined) {
                    totalScore += weekScores[playerId];
                    weeksCounted++;
                }
            }

            substitute.score = weeksCounted > 0 ? totalScore / weeksCounted : 0;
            eligibleSubs.push(substitute);
        }

        if (eligibleSubs.length === 0) {
            if (awardType === 'nextup') {
                const healthyPlayerIndex = injuredPlayer.index === 0 ? 1 : 0;
                const healthyPlayer = originalDuo[healthyPlayerIndex];
                const healthyExperience = this.resolveNextUpExperience(healthyPlayer, roster);
                const needed = healthyExperience
                    ? `0-3 yrs experience, not ${healthyExperience.years} yrs, not ${healthyExperience.position}`
                    : '0-3 yrs experience, differing years and position from the healthy player';
                console.log(`❌ NO ELIGIBLE SUBSTITUTES: Need ${needed} to pair with ${healthyPlayer.name}. No valid candidates available on roster.`);
            }
            return null;
        }

        // Sort by average score (descending - best first)
        eligibleSubs.sort((a, b) => b.score - a.score);

        // Auto-sub selection (both awards, same rule): take the top 4 by recent
        // scoring average, pick uniformly at random among them (25% each, not
        // weighted toward the best) - competitive without being predictable, and
        // never risks landing on a player who never puts up points at all.
        const topPerformers = eligibleSubs.slice(0, Math.min(4, eligibleSubs.length));
        const selectedIndex = Math.floor(Math.random() * topPerformers.length);
        const selectedSub = topPerformers[selectedIndex];
        const rankText = ['1st', '2nd', '3rd', '4th'][selectedIndex];
        const experienceNote = awardType === 'nextup' ? ` (${selectedSub.yearsExp} yrs, ${selectedSub.position})` : '';

        console.log(`Selected ${selectedSub.name}${experienceNote} (${rankText} best: ${selectedSub.score.toFixed(1)} avg pts/wk over last 3 weeks) from top ${topPerformers.length} available for ${teamName}`);

        return selectedSub;
    }

    // True if this specific Sleeper player is on this team's LIVE roster right now.
    isPlayerOnTeamRoster(teamName, sleeperPlayerId) {
        const roster = this.leagueData.rosters.find(r => this.leagueData.userMap[r.owner_id] === teamName);
        return !!roster && !!sleeperPlayerId && roster.players.includes(sleeperPlayerId);
    }

    // Flat-model replacement selection: same top-4, flat-random-by-3-week-average
    // logic already verified for the old model (see findSubstitute), adapted to
    // take direct team/award/exclusion inputs instead of the old injuredPlayer/
    // originalDuo shapes duos no longer needs.
    async selectAutoReplacement(teamName, awardType, week, excludeSleeperIds, otherSlotInfo, kickoffBufferMinutes = 0) {
        const roster = this.leagueData.rosters.find(r => this.leagueData.userMap[r.owner_id] === teamName);
        if (!roster) {
            console.warn(`No roster found for ${teamName} - cannot select a replacement`);
            return null;
        }

        const validPositions = awardType === 'nextup'
            ? ['QB', 'RB', 'WR', 'TE', 'K']
            : awardType === 'boom'
                // Includes both Sleeper's broad IDP categories AND granular
                // NFL position labels - confirmed inconsistent across
                // players via a real support report (Danielle Hunter still
                // tagged "DE" rather than the broad "DL"). See the matching
                // comment on BOOM_POSITIONS in the Edge Functions' shared
                // eligibility.ts - keep both lists in sync.
                ? ['DL', 'LB', 'DB', 'DE', 'DT', 'NT', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS']
                : ['QB', 'RB', 'WR', 'TE'];

        const eligibleCandidates = [];

        for (const playerId of roster.players) {
            if (excludeSleeperIds.includes(playerId)) continue;

            const player = this.playersData[playerId];
            if (!player || !validPositions.includes(player.position)) continue;

            if (player.injury_status) {
                const status = player.injury_status.toLowerCase();
                if (['out', 'doubtful', 'ir', 'pup'].includes(status)) continue;
            }

            if (await this.isPlayerOnBye(playerId, week)) continue;

            // Can't add someone whose own game for this week has already
            // started. Season of Boom uses the buffered version of this
            // check (see isEligibleForSub) so auto-sub can trigger BEFORE
            // the exact kickoff moment, with a configurable safety margin.
            // Main Award/Next Up still use the original exact-kickoff
            // check unchanged - that retrofit is separate, deliberately
            // deferred work, not part of this change.
            if (awardType === 'boom') {
                if (!(await this.isEligibleForSub(playerId, week, kickoffBufferMinutes))) continue;
            } else {
                if (await this.hasPlayerGameStarted(playerId, week)) continue;
            }

            if (awardType === 'nextup' && !this.isNextUpEligibleExperience(player.years_exp || 0)) continue;

            // Season of Boom has no combo constraint at all - any 2 IDPs
            // freely, regardless of position overlap.
            if (otherSlotInfo && awardType !== 'boom') {
                const candidateInfo = { position: player.position, years: player.years_exp || 0 };
                const valid = awardType === 'main'
                    ? this.validateDuoCombination(otherSlotInfo.position, candidateInfo.position)
                    : this.isValidNextUpCombo(otherSlotInfo, candidateInfo);
                if (!valid) continue;
            }

            let totalScore = 0;
            let weeksCounted = 0;
            for (let w = Math.max(1, week - 2); w <= week; w++) {
                const weekScores = await this.getWeeklyScores(w);
                if (weekScores[playerId] !== undefined) {
                    totalScore += weekScores[playerId];
                    weeksCounted++;
                }
            }

            eligibleCandidates.push({
                id: playerId,
                name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
                position: player.position,
                yearsExp: player.years_exp || 0,
                score: weeksCounted > 0 ? totalScore / weeksCounted : 0
            });
        }

        if (eligibleCandidates.length === 0) {
            console.warn(`No eligible replacement found for ${teamName}/${awardType}`);
            return null;
        }

        eligibleCandidates.sort((a, b) => b.score - a.score);
        const topPerformers = eligibleCandidates.slice(0, Math.min(4, eligibleCandidates.length));
        const selectedIndex = Math.floor(Math.random() * topPerformers.length);
        const selected = topPerformers[selectedIndex];

        console.log(`Auto-selected ${selected.name} (${selected.score.toFixed(1)} avg pts/wk) for ${teamName}/${awardType} from top ${topPerformers.length}`);
        return selected;
    }

    // Bonus values, tier 1 (best-scoring winner that week) through tier 6
    // (worst-scoring winner). Ranges 3-15, with a deliberate gap at the top
    // (6 points between 1st and 2nd) so a standout week is clearly rewarded,
    // then a smoother taper down to the floor.
    static BONUS_TIERS = [15, 9, 7, 5, 4, 3];

    // Bonus matchups are a regular-season-only mechanic - the league's regular
    // season runs 14 weeks before playoffs begin. No matchups are generated
    // for week 15+.
    static REGULAR_SEASON_WEEKS = 14;

    // Standard round-robin "circle method": fixes one team, rotates the rest
    // around it across N-1 rounds. Every team plays every other team exactly
    // once per full cycle. This schedule is entirely separate from the real
    // Sleeper league's own matchups - built specifically for this bonus game.
    generateRoundRobinSchedule(teamNames) {
        const teams = [...teamNames];
        if (teams.length % 2 !== 0) teams.push(null); // odd team count - one bye per round
        const n = teams.length;
        if (n < 2) return [];

        const rounds = [];
        const fixed = teams[0];
        let rotating = teams.slice(1);

        for (let r = 0; r < n - 1; r++) {
            const roundPairs = [];
            const current = [fixed, ...rotating];
            for (let i = 0; i < n / 2; i++) {
                const a = current[i];
                const b = current[n - 1 - i];
                if (a !== null && b !== null) roundPairs.push([a, b]);
            }
            rounds.push(roundPairs);
            rotating.unshift(rotating.pop());
        }
        return rounds;
    }

    // Which 6 matchups are live for a given week. Sorted by roster_id (a
    // stable numeric ID within the league), not display_name - so a mid-season
    // team rename can never reshuffle the schedule. Cycles back to round 1
    // after a full round-robin (11 weeks for 12 teams) if the regular season
    // runs longer than that - but never generates matchups past the regular
    // season's final week (see REGULAR_SEASON_WEEKS). This is a regular-season
    // mechanic; it doesn't carry into playoffs.
    getBrownBellMatchupsForWeek(week) {
        if (week > BrownBellAutomator.REGULAR_SEASON_WEEKS) return [];

        const sortedTeamNames = [...(this.leagueData?.rosters || [])]
            .sort((a, b) => a.roster_id - b.roster_id)
            .map(r => this.leagueData.userMap[r.owner_id])
            .filter(Boolean);

        const schedule = this.generateRoundRobinSchedule(sortedTeamNames);
        if (schedule.length === 0) return [];

        const roundIndex = (week - 1) % schedule.length;
        return schedule[roundIndex];
    }

    // Given this week's matchups and each team's Main Award total for the
    // week, ranks the 6 winning (or tied) scores into tiers 1-6 and assigns
    // bonus points. A tie means both teams "win" their matchup and split that
    // tier's bonus evenly - never a coin flip, never zero for either side.
    computeBrownBellBonuses(matchups, weekTotalsByTeam) {
        const outcomes = matchups.map(([teamA, teamB]) => {
            const scoreA = weekTotalsByTeam[teamA] ?? 0;
            const scoreB = weekTotalsByTeam[teamB] ?? 0;
            if (scoreA > scoreB) return { teamA, teamB, winners: [teamA], score: scoreA, tied: false };
            if (scoreB > scoreA) return { teamA, teamB, winners: [teamB], score: scoreB, tied: false };
            return { teamA, teamB, winners: [teamA, teamB], score: scoreA, tied: true };
        });

        const ranked = [...outcomes].sort((x, y) => y.score - x.score);
        const resultsByTeam = {};

        ranked.forEach((outcome, i) => {
            const tier = i + 1;
            const tierBonus = BrownBellAutomator.BONUS_TIERS[i];

            for (const team of [outcome.teamA, outcome.teamB]) {
                const opponent = team === outcome.teamA ? outcome.teamB : outcome.teamA;
                const teamScore = weekTotalsByTeam[team] ?? 0;
                const opponentScore = weekTotalsByTeam[opponent] ?? 0;
                const isWinner = outcome.winners.includes(team);

                resultsByTeam[team] = {
                    opponent,
                    teamScore,
                    opponentScore,
                    outcome: outcome.tied ? 'tie' : (isWinner ? 'win' : 'loss'),
                    tier: isWinner ? tier : null,
                    bonusPoints: !isWinner ? 0 : (outcome.tied ? tierBonus / 2 : tierBonus)
                };
            }
        });

        return resultsByTeam;
    }

    // The core decision engine for the duos-as-source-of-truth model. For every
    // duo slot: skip if not locked yet (pre-lock is fully owner-editable, the
    // automation stays out of it entirely). Once locked, freeze the original
    // player one time. Then classify: still rostered + healthy -> do nothing;
    // still rostered + genuinely injured -> temporary (unconditional, unlimited,
    // auto-reverts to the frozen original once they're healthy again); not on
    // the roster at all -> permanent (trade/release), gated by the team's
    // Season of Boom's core new behavior: instead of immediately auto-filling
    // (Main Award/Next Up's existing behavior for a temporary departure) or
    // immediately clearing with no further checks (existing behavior for a
    // 1st permanent departure), boom gives the owner a real window to pick
    // their own replacement, with auto-sub as a safety net that only kicks
    // in once the best remaining candidate's kickoff is imminent (see
    // isEligibleForSub's buffer). Shared between the initial detection (in
    // processDuoSlots below) and the periodic re-check of an already-vacant
    // slot (checkBoomPendingVacancy) - both need the identical decision,
    // just with different wording depending on what caused the vacancy.
    async resolveBoomVacancy(teamName, playerIndex, excludeIds, currentPlayerName, currentPlayerPosition, reasonWhenWaiting, reasonWhenAutoFilled, reasonWhenNoneAvailable, eventTypeWaiting, eventTypeAutoFilled, week) {
        const bestCandidate = await this.selectAutoReplacement(teamName, 'boom', week, excludeIds, null, 0);

        if (!bestCandidate) {
            await this.dataLayer.logSubstitution({
                teamName, awardType: 'boom', playerIndex,
                originalName: currentPlayerName, originalPosition: currentPlayerPosition,
                substituteName: null, substitutePlayerId: null, substitutePosition: null,
                week, source: 'auto', reason: reasonWhenNoneAvailable, noReplacementAvailable: true
            });
            return { type: 'no-replacement', teamName, awardType: 'boom' };
        }

        // 15-minute buffer: the automation's own safety margin before it
        // steps in, wider than the owner's tighter 1-minute manual window
        // (enforced separately, in set-duo) since this only checks
        // periodically rather than continuously.
        const stillHasTime = await this.isEligibleForSub(bestCandidate.id, week, 15);

        if (stillHasTime) {
            // Clear but PRESERVE the row (sleeper_player_id: null, not a
            // deleted row) so original_sleeper_player_id survives for the
            // revert check and this same vacancy can be re-evaluated on a
            // later run without losing track of who was originally here.
            await this.dataLayer.upsertDuoSlot({
                teamName, awardType: 'boom', playerIndex,
                playerName: null, playerPosition: null, sleeperPlayerId: null, source: 'auto'
            });
            await this.dataLayer.logSubstitution({
                teamName, awardType: 'boom', playerIndex,
                originalName: currentPlayerName, originalPosition: currentPlayerPosition,
                substituteName: null, substitutePlayerId: null, substitutePosition: null,
                week, source: 'auto', reason: reasonWhenWaiting
            });
            return { type: eventTypeWaiting, teamName, awardType: 'boom' };
        }

        await this.dataLayer.upsertDuoSlot({
            teamName, awardType: 'boom', playerIndex,
            playerName: bestCandidate.name, playerPosition: bestCandidate.position,
            sleeperPlayerId: bestCandidate.id, source: 'auto'
        });
        await this.dataLayer.logSubstitution({
            teamName, awardType: 'boom', playerIndex,
            originalName: currentPlayerName, originalPosition: currentPlayerPosition,
            substituteName: bestCandidate.name, substitutePlayerId: bestCandidate.id, substitutePosition: bestCandidate.position,
            week, source: 'auto', reason: reasonWhenAutoFilled
        });
        return { type: eventTypeAutoFilled, teamName, awardType: 'boom', replacement: bestCandidate.name };
    }

    // Periodic re-check for a boom slot that's ALREADY empty (from a prior
    // run's clear-and-wait decision above). A slot that's simply never been
    // set at all (no frozen original) is untouched by this - the owner just
    // hasn't made their initial pick yet, nothing pending to resolve.
    async checkBoomPendingVacancy(row, week, byTeamAward) {
        if (!row.originalSleeperPlayerId) return null;

        const originalPlayer = this.playersData[row.originalSleeperPlayerId];
        const originalOnRoster = this.isPlayerOnTeamRoster(row.teamName, row.originalSleeperPlayerId);
        const originalStatus = (originalPlayer?.injury_status || '').toLowerCase();
        const originalHealthy = originalOnRoster && !['out', 'doubtful', 'ir', 'pup'].includes(originalStatus);

        // A genuinely permanent departure can never pass originalOnRoster
        // (they're gone from this team's roster for good), so this revert
        // path is naturally safe for temporary vacancies only - no separate
        // "was this temporary or permanent" tracking needed.
        if (originalHealthy) {
            const originalName = `${originalPlayer.first_name || ''} ${originalPlayer.last_name || ''}`.trim();
            await this.dataLayer.upsertDuoSlot({
                teamName: row.teamName, awardType: 'boom', playerIndex: row.playerIndex,
                playerName: originalName, playerPosition: originalPlayer.position,
                sleeperPlayerId: row.originalSleeperPlayerId, source: 'auto'
            });
            await this.dataLayer.logSubstitution({
                teamName: row.teamName, awardType: 'boom', playerIndex: row.playerIndex,
                originalName: '(pending vacancy)', originalPosition: '-',
                substituteName: originalName, substitutePlayerId: row.originalSleeperPlayerId, substitutePosition: originalPlayer.position,
                week, source: 'auto', reason: 'Reverted to original player - healthy again'
            });
            return { type: 'reverted', teamName: row.teamName, awardType: 'boom' };
        }

        const pairRow = byTeamAward[`${row.teamName}|boom`]?.[row.playerIndex === 0 ? 1 : 0];
        const excludeIds = [pairRow?.sleeperPlayerId].filter(Boolean);

        return this.resolveBoomVacancy(
            row.teamName, row.playerIndex, excludeIds, '(pending vacancy)', '-',
            'Still awaiting owner pick - plenty of time before kickoff',
            'Auto-sub - kickoff approaching, no owner pick made',
            'No eligible replacement currently available - still waiting',
            'boom-still-waiting', 'boom-auto-fill-near-kickoff', week
        );
    }

    // 2-swap season budget - 1st time leaves the slot open for the owner, 2nd
    // time auto-fills immediately and revokes manual privilege for the rest of
    // the season.
    async processDuoSlots(week) {
        const duoRows = await this.dataLayer.loadDuoRows();
        const events = [];
        // Captured for EVERY row with a resolved player, locked or not - this
        // is purely a display field for the Teams tab's injury dots, separate
        // from the lock/substitution decisions below.
        const injuryStatusUpdates = [];

        const byTeamAward = {};
        for (const row of duoRows) {
            const key = `${row.teamName}|${row.awardType}`;
            byTeamAward[key] = byTeamAward[key] || {};
            byTeamAward[key][row.playerIndex] = row;
        }

        for (const row of duoRows) {
            if (!row.sleeperPlayerId) {
                if (row.awardType === 'boom') {
                    const event = await this.checkBoomPendingVacancy(row, week, byTeamAward);
                    if (event) events.push(event);
                }
                continue;
            }

            const player = this.playersData[row.sleeperPlayerId];
            if (!player) {
                console.warn(`Could not resolve player ${row.sleeperPlayerId} for ${row.teamName}/${row.awardType}`);
                continue;
            }

            injuryStatusUpdates.push({ rowId: row.rowId, injuryStatus: player.injury_status || null });

            // Locks are for the SEASON - always checked against week 1, matching
            // the Edge Functions (get-eligible-roster/set-duo) exactly.
            const locked = await this.hasPlayerGameStarted(row.sleeperPlayerId, 1);
            if (!locked) continue;

            if (!row.originalSleeperPlayerId) {
                await this.dataLayer.freezeOriginalPlayer(row.rowId, row.sleeperPlayerId);
                row.originalSleeperPlayerId = row.sleeperPlayerId;
            }

            const pairRow = byTeamAward[`${row.teamName}|${row.awardType}`]?.[row.playerIndex === 0 ? 1 : 0];
            const otherSlotInfo = pairRow?.sleeperPlayerId
                ? {
                    position: this.playersData[pairRow.sleeperPlayerId]?.position || pairRow.playerPosition,
                    years: this.playersData[pairRow.sleeperPlayerId]?.years_exp || 0
                }
                : null;

            // Cross-award exclusivity - a player already used in this team's
            // OTHER award can never be auto-filled into this one too.
            const otherAwardType = row.awardType === 'main' ? 'nextup' : 'main';
            const otherAwardRows = byTeamAward[`${row.teamName}|${otherAwardType}`] || {};
            const otherAwardPlayerIds = [otherAwardRows[0]?.sleeperPlayerId, otherAwardRows[1]?.sleeperPlayerId].filter(Boolean);

            const excludeIds = [row.sleeperPlayerId, pairRow?.sleeperPlayerId, ...otherAwardPlayerIds].filter(Boolean);

            const onRoster = this.isPlayerOnTeamRoster(row.teamName, row.sleeperPlayerId);

            if (onRoster) {
                // Auto-revert check FIRST, whenever we're currently covering with
                // someone other than the frozen original - regardless of whether
                // that stand-in is themselves fine right now. A working stand-in
                // must never block restoring the true original once they're back.
                if (row.sleeperPlayerId !== row.originalSleeperPlayerId) {
                    const originalPlayer = this.playersData[row.originalSleeperPlayerId];
                    const originalOnRoster = this.isPlayerOnTeamRoster(row.teamName, row.originalSleeperPlayerId);
                    const originalStatus = (originalPlayer?.injury_status || '').toLowerCase();
                    const originalHealthy = originalOnRoster && !['out', 'doubtful', 'ir', 'pup'].includes(originalStatus);

                    if (originalHealthy) {
                        const originalName = `${originalPlayer.first_name || ''} ${originalPlayer.last_name || ''}`.trim();
                        await this.dataLayer.upsertDuoSlot({
                            teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                            playerName: originalName, playerPosition: originalPlayer.position,
                            sleeperPlayerId: row.originalSleeperPlayerId, source: 'auto'
                        });
                        await this.dataLayer.logSubstitution({
                            teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                            originalName: row.playerName, originalPosition: row.playerPosition,
                            substituteName: originalName, substitutePlayerId: row.originalSleeperPlayerId, substitutePosition: originalPlayer.position,
                            week, source: 'auto', reason: 'Reverted to original player - healthy again'
                        });
                        events.push({ type: 'reverted', teamName: row.teamName, awardType: row.awardType });
                        continue;
                    }
                }

                // Current occupant (whoever it is - original or a stand-in) still
                // needs to genuinely be out to warrant any further action.
                const status = (player.injury_status || '').toLowerCase();
                const qualifyingInjury = ['out', 'doubtful', 'ir', 'pup'].includes(status);
                if (!qualifyingInjury) continue;

                if (row.awardType === 'boom') {
                    // Boom gives the owner a real window to pick their own
                    // replacement here, rather than auto-filling immediately
                    // like Main Award/Next Up still do - see resolveBoomVacancy.
                    const event = await this.resolveBoomVacancy(
                        row.teamName, row.playerIndex, excludeIds, row.playerName, row.playerPosition,
                        `Temporary - ${player.first_name} ${player.last_name} is ${status}, cleared - pick a replacement or auto-sub kicks in near kickoff`,
                        `Temporary - ${player.first_name} ${player.last_name} is ${status}, auto-subbed (kickoff approaching, no owner pick made)`,
                        `No eligible replacement found - ${player.first_name} ${player.last_name} is ${status}, left in slot`,
                        'boom-temporary-cleared-for-owner', 'temporary-fill', week
                    );
                    events.push(event);
                    continue;
                }

                const replacement = await this.selectAutoReplacement(row.teamName, row.awardType, week, excludeIds, otherSlotInfo);
                if (replacement) {
                    await this.dataLayer.upsertDuoSlot({
                        teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                        playerName: replacement.name, playerPosition: replacement.position,
                        sleeperPlayerId: replacement.id, source: 'auto'
                    });
                    await this.dataLayer.logSubstitution({
                        teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                        originalName: row.playerName, originalPosition: row.playerPosition,
                        substituteName: replacement.name, substitutePlayerId: replacement.id, substitutePosition: replacement.position,
                        week, source: 'auto', reason: `Temporary - ${player.first_name} ${player.last_name} is ${status}`
                    });
                    events.push({ type: 'temporary-fill', teamName: row.teamName, awardType: row.awardType, replacement: replacement.name });
                } else {
                    // No eligible replacement anywhere on the roster - leave the
                    // injured player in place (they're still legitimately theirs,
                    // just out this week) but log it so the owner isn't left
                    // guessing why nothing changed.
                    await this.dataLayer.logSubstitution({
                        teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                        originalName: row.playerName, originalPosition: row.playerPosition,
                        substituteName: null, substitutePlayerId: null, substitutePosition: null,
                        week, source: 'auto',
                        reason: `No eligible replacement found - ${player.first_name} ${player.last_name} is ${status}, left in slot`,
                        noReplacementAvailable: true
                    });
                    events.push({ type: 'no-replacement', teamName: row.teamName, awardType: row.awardType });
                }

            } else {
                // PERMANENT - not on roster at all (traded or released)
                const swapState = this.dataLayer.getTeamSwapState(row.teamName);

                if (!swapState.manualPrivilege || swapState.permanentSwapsUsed >= 1) {
                    // Privilege already gone, OR this is the 2nd permanent departure -
                    // auto-fill immediately either way.
                    const replacement = await this.selectAutoReplacement(row.teamName, row.awardType, week, excludeIds, otherSlotInfo);
                    if (replacement) {
                        await this.dataLayer.upsertDuoSlot({
                            teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                            playerName: replacement.name, playerPosition: replacement.position,
                            sleeperPlayerId: replacement.id, source: 'auto'
                        });

                        const wasPrivilegeLoss = swapState.manualPrivilege && swapState.permanentSwapsUsed >= 1;
                        if (wasPrivilegeLoss) {
                            await this.dataLayer.updateTeamSwapState(row.teamName, { permanentSwapsUsed: 2, manualPrivilege: false });
                        }

                        await this.dataLayer.logSubstitution({
                            teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                            originalName: row.playerName, originalPosition: row.playerPosition,
                            substituteName: replacement.name, substitutePlayerId: replacement.id, substitutePosition: replacement.position,
                            week, source: 'auto',
                            reason: wasPrivilegeLoss
                                ? 'Permanent departure - 2nd of the season, auto-filled, manual privilege revoked for rest of season'
                                : 'Permanent departure - manual privilege already used up, auto-filled'
                        });
                        events.push({ type: wasPrivilegeLoss ? 'permanent-auto-fill-privilege-revoked' : 'permanent-auto-fill', teamName: row.teamName, awardType: row.awardType });
                    } else {
                        // No eligible replacement anywhere on the roster. Leaving the
                        // slot pointing at a player who's no longer even on this
                        // team would be actively misleading - clear it instead, same
                        // as the "1st departure" case below, so it honestly reads as
                        // empty rather than showing a phantom player.
                        await this.dataLayer.clearDuoSlot(row.teamName, row.awardType, row.playerIndex);
                        await this.dataLayer.logSubstitution({
                            teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                            originalName: row.playerName, originalPosition: row.playerPosition,
                            substituteName: null, substitutePlayerId: null, substitutePosition: null,
                            week, source: 'auto',
                            reason: 'No eligible replacement found - slot cleared, awaiting owner pick',
                            noReplacementAvailable: true
                        });
                        events.push({ type: 'no-replacement', teamName: row.teamName, awardType: row.awardType });
                    }
                } else if (row.awardType === 'boom') {
                    // 1st permanent departure of the season, boom specifically -
                    // same owner-window-then-auto-fallback pattern as the
                    // temporary case above, not an unconditional clear.
                    const event = await this.resolveBoomVacancy(
                        row.teamName, row.playerIndex, excludeIds, row.playerName, row.playerPosition,
                        'Permanent departure - cleared (1st permanent swap of the season) - pick a replacement or auto-sub kicks in near kickoff',
                        'Permanent departure - auto-subbed (kickoff approaching, no owner pick made) - 1st permanent swap of the season',
                        'Permanent departure - no eligible replacement currently available - still waiting (1st permanent swap of the season)',
                        'boom-permanent-cleared-for-owner', 'permanent-auto-fill', week
                    );
                    events.push(event);
                    // Still counts as the season's 1st permanent swap, same
                    // budget accounting as Main Award/Next Up.
                    await this.dataLayer.updateTeamSwapState(row.teamName, { permanentSwapsUsed: 1, manualPrivilege: true });
                } else {
                    // 1st permanent departure of the season - leave it open for the owner
                    await this.dataLayer.clearDuoSlot(row.teamName, row.awardType, row.playerIndex);
                    await this.dataLayer.logSubstitution({
                        teamName: row.teamName, awardType: row.awardType, playerIndex: row.playerIndex,
                        originalName: row.playerName, originalPosition: row.playerPosition,
                        substituteName: null, substitutePlayerId: null, substitutePosition: null,
                        week, source: 'auto', reason: 'Permanent departure - slot cleared, awaiting owner pick (1st permanent swap of the season)'
                    });
                    events.push({ type: 'permanent-cleared-for-owner', teamName: row.teamName, awardType: row.awardType });
                }
            }
        }

        await this.dataLayer.updateDuoInjuryStatuses(injuryStatusUpdates);

        return events;
    }

    hasActiveSubstitution(teamName, playerIndex, week, awardType, existingSubstitutions) {
        return existingSubstitutions.some(sub =>
            sub.teamName === teamName &&
            sub.playerIndex === playerIndex &&
            sub.awardType === awardType &&
            sub.startWeek <= week &&
            (!sub.endWeek || sub.endWeek >= week)
        );
    }

    // Recovered from the original implementation - filters/fixes the raw
    // substitutions list loaded each run. Still relied on by updateAllScores'
    // legacy historical-scoring path (getPlayerExperienceForWeek, active-sub
    // lookups for past weeks) - not yet migrated to the flat duos model, see
    // the known gap noted elsewhere. Pure filtering + a minor date-range
    // fixup, no other side effects.
    cleanupSubstitutions(substitutions, currentWeek) {
        const validSubstitutions = substitutions.filter(sub => {
            // Fix invalid date ranges
            if (sub.endWeek && sub.endWeek < sub.startWeek) {
                console.log(`Fixing invalid date range for ${sub.substituteName}`);
                sub.endWeek = null;
            }

            // Remove future substitutions
            if (sub.startWeek > currentWeek) {
                console.log(`Removing future substitution: ${sub.substituteName} (starts Week ${sub.startWeek})`);
                return false;
            }

            return true;
        });

        console.log(`Validated ${validSubstitutions.length} substitutions (removed ${substitutions.length - validSubstitutions.length})`);
        return validSubstitutions;
    }

    async updateAllScores(existingSubstitutions, rosterChanges, existingScores) {
        console.log('Updating all weekly scores...');

        const currentWeek = await this.getCurrentWeek();
        const scores = { main: {}, nextup: {} };
        const playerIds = { main: {}, nextup: {} };
        const wasBye = { main: {}, nextup: {} }; // captured alongside scores - who was on bye, per week, for the historical badge

        existingSubstitutions = existingSubstitutions || [];
        rosterChanges = rosterChanges || [];
        // Fallback source for inactive teams' historical weeks only - see PRIORITY 3 below.
        existingScores = existingScores || { main: {}, nextup: {} };

        // Process each award type
        for (const awardType of ['main', 'nextup']) {
            const duos = this.knownDuos[awardType];

            for (const [teamName, originalDuo] of Object.entries(duos)) {
                scores[awardType][teamName] = {};
                playerIds[awardType][teamName] = {};
                wasBye[awardType][teamName] = {};

                const roster = this.leagueData.rosters.find(r =>
                    this.leagueData.userMap[r.owner_id] === teamName
                );

                const inactiveTeam = this.inactiveTeams[teamName];
                const teamLastWeek = inactiveTeam ? inactiveTeam.lastActiveWeek : currentWeek;

                if (inactiveTeam) {
                    console.log(`⚠️ Team ${teamName} is inactive after Week ${inactiveTeam.lastActiveWeek} - ${inactiveTeam.reason}`);
                }

                if (!roster) {
                    console.warn(`⚠️ No roster found for ${teamName} - using historical data only`);
                    // For inactive teams, still process historical scores
                    if (!inactiveTeam) {
                        continue; // Skip if no roster and not a known inactive team
                    }
                }

                // Get scores for each week up to current OR last active week
                for (let week = 1; week <= Math.min(currentWeek, teamLastWeek); week++) {
                    const weekScores = await this.getWeeklyScores(week);
                    scores[awardType][teamName][week] = {};
                    playerIds[awardType][teamName][week] = {};
                    wasBye[awardType][teamName][week] = {};

                    for (let index = 0; index < originalDuo.length; index++) {
                        const originalPlayer = originalDuo[index];
                        let playerId;
                        // Only meaningful for past-week reconstruction and the log
                        // lines below - left null on the current-week fast path.
                        let activeSub = null;

                        if (week === currentWeek) {
                            // Current week: duos is the live source of truth, loaded
                            // fresh at the top of this run - no ambiguity, so read it
                            // directly rather than reconstructing "who was playing"
                            // via the substitutions log (which exists for genuinely
                            // historical weeks, not to second-guess right now).
                            playerId = originalPlayer.sleeperId || null;
                            if (playerId) {
                                console.log(`Week ${week} (current): ${originalPlayer.name} (${playerId}) for ${teamName}, from live duos`);
                            }
                        } else {
                        // Check if this player was traded
                        const tradeInfo = rosterChanges.find(rc =>
                            rc.teamName === teamName &&
                            rc.playerIndex === index &&
                            rc.awardType === awardType
                        );

                        // Check for active substitution in this week
                        // PRIORITY ORDER:
                        // 1. Temporary bye replacements (isTemporaryByeReplacement: true)
                        // 2. Other temporary subs (has endWeek)
                        // 3. Permanent subs (endWeek: null)
                        const activeSubstitutions = existingSubstitutions.filter(sub =>
                            sub.teamName === teamName &&
                            sub.playerIndex === index &&
                            sub.awardType === awardType &&
                            sub.startWeek <= week &&
                            (!sub.endWeek || sub.endWeek >= week)
                        );

                        // Find temporary bye replacement first (highest priority)
                        activeSub = activeSubstitutions.find(sub => sub.isTemporaryByeReplacement === true);

                        // If no temporary bye replacement, find other temporary subs
                        if (!activeSub) {
                            activeSub = activeSubstitutions.find(sub => sub.endWeek !== null && !sub.isTemporaryByeReplacement);
                        }

                        // If no temporary subs, use permanent sub
                        if (!activeSub) {
                            activeSub = activeSubstitutions.find(sub => sub.endWeek === null);
                        }

                        // PRIORITY 1: Active substitution (trade or injury)
                        if (activeSub) {
                            playerId = activeSub.substitutePlayerId;
                            console.log(`Week ${week}: Using substitute ${activeSub.substituteName} (${playerId}) for ${teamName}`);
                        }
                        // PRIORITY 2: Pre-trade weeks - use original player's historical points
                        else if (tradeInfo && week < tradeInfo.changeWeek) {
                            playerId = this.findPlayerInRoster(originalPlayer, roster, true); // Allow traded players
                            if (playerId) {
                                console.log(`Week ${week}: Using pre-trade ${originalPlayer.name} (${playerId}) for ${teamName}`);
                            }
                        }
                        // PRIORITY 3: Normal active roster
                        else {
                            if (!roster) {
                                // No roster available (inactive team) - fall back to previously
                                // recorded scores for this frozen historical week
                                const awardScores = existingScores[awardType];
                                scores[awardType][teamName][week][index] = awardScores?.[teamName]?.[week]?.[index] || 0;
                                playerIds[awardType][teamName][week][index] = null;
                                wasBye[awardType][teamName][week][index] = false;
                                continue;
                            }
                            playerId = this.findPlayerInRoster(originalPlayer, roster);
                        }
                        }

                        playerIds[awardType][teamName][week][index] = playerId || null;

                        if (playerId && weekScores[playerId] !== undefined) {
                            // Check if this player is on bye this week
                            const onBye = await this.isPlayerOnBye(playerId, week);
                            wasBye[awardType][teamName][week][index] = onBye;
                            if (onBye) {
                                scores[awardType][teamName][week][index] = 0;
                                const playerName = activeSub ? activeSub.substituteName : originalPlayer.name;
                                console.log(`${playerName} on bye week ${week} - 0 points`);
                            } else {
                                scores[awardType][teamName][week][index] = weekScores[playerId];
                                if (activeSub) {
                                    console.log(`Substitute score: ${activeSub.substituteName} = ${weekScores[playerId]} points`);
                                }
                            }
                        } else {
                            // No live score data yet - could mean genuinely on bye, or just
                            // too early in the week for this game's data to have posted.
                            // These are different things; check for real rather than assume.
                            wasBye[awardType][teamName][week][index] = playerId ? await this.isPlayerOnBye(playerId, week) : false;
                            scores[awardType][teamName][week][index] = 0;
                            if (activeSub) {
                                console.log(`No score found for substitute ${activeSub.substituteName} (${playerId})`);
                            }
                        }
                    }

                    // Validate Next Up Award combinations after scores are set
                    if (awardType === 'nextup') {
                        // Get both players' current { years, position } for this week
                        const player1Experience = this.getPlayerExperienceForWeek(teamName, 0, week, existingSubstitutions, currentWeek);
                        const player2Experience = this.getPlayerExperienceForWeek(teamName, 1, week, existingSubstitutions, currentWeek);

                        // Valid combo (2026 rule): both players individually eligible (0-3 yrs
                        // experience) AND they differ in both years of experience and position.
                        // Two rookies, two players at the same experience year, two players at
                        // the same position, or anyone 4+ years, are all invalid. A null result
                        // means one/both couldn't be resolved at all - not flagged, since there's
                        // no live data to judge against yet (distinct from a resolved-but-invalid combo).
                        const combo = this.isValidNextUpCombo(player1Experience, player2Experience);

                        if (combo === false) {

                            console.log(`Invalid Next Up combination for ${teamName} Week ${week}: ${JSON.stringify(player1Experience)} + ${JSON.stringify(player2Experience)}`);

                            // Only zero the substitute's score, not the original player's score
                            const player1Sub = existingSubstitutions.find(sub =>
                                sub.teamName === teamName && sub.playerIndex === 0 && sub.awardType === 'nextup' &&
                                sub.startWeek <= week && (!sub.endWeek || sub.endWeek >= week)
                            );
                            const player2Sub = existingSubstitutions.find(sub =>
                                sub.teamName === teamName && sub.playerIndex === 1 && sub.awardType === 'nextup' &&
                                sub.startWeek <= week && (!sub.endWeek || sub.endWeek >= week)
                            );

                            // Zero only the substitute player's score
                            if (player1Sub) {
                                scores[awardType][teamName][week][0] = 0;
                                console.log(`Zeroing substitute ${player1Sub.substituteName} score`);
                            }
                            if (player2Sub) {
                                scores[awardType][teamName][week][1] = 0;
                                console.log(`Zeroing substitute ${player2Sub.substituteName} score`);
                            }
                        }
                    }
                }
            }
        }

        return { scores, playerIds, wasBye };
    }

    getPlayerExperienceForWeek(teamName, playerIndex, week, existingSubstitutions, currentWeek) {
        const originalDuo = this.knownDuos.nextup[teamName];
        if (!originalDuo) return null;

        if (week === currentWeek) {
            // Current week: duos is live and unambiguous - read directly rather
            // than reconstructing via the substitutions log. Same principle as
            // the main scoring resolution above, and the same reason: multiple
            // "active" (end_week: null) entries can exist for one slot, and
            // which one .find() returns first isn't guaranteed to be the most
            // recent pick.
            const sleeperId = originalDuo[playerIndex]?.sleeperId;
            const player = sleeperId ? this.playersData?.[sleeperId] : null;
            if (!player) return null;
            const resolved = { years: player.years_exp || 0, position: player.position };
            console.log(`Week ${week} (current): ${originalDuo[playerIndex].name} experience: ${resolved.years} yrs, ${resolved.position}, from live duos`);
            return resolved;
        }

        // Check for active substitution
        const activeSub = existingSubstitutions.find(sub =>
            sub.teamName === teamName &&
            sub.playerIndex === playerIndex &&
            sub.awardType === 'nextup' &&
            sub.startWeek <= week &&
            (!sub.endWeek || sub.endWeek >= week)
        );

        if (activeSub && activeSub.substitutePlayerId) {
            const player = this.playersData?.[activeSub.substitutePlayerId];
            if (!player) return null;
            const resolved = { years: player.years_exp || 0, position: player.position };
            console.log(`Substitute ${activeSub.substituteName} experience: ${resolved.years} yrs, ${resolved.position}`);
            return resolved;
        }

        const roster = this.leagueData?.rosters?.find(r => this.leagueData.userMap[r.owner_id] === teamName);
        return this.resolveNextUpExperience(originalDuo[playerIndex], roster);
    }

    // Next Up Award eligibility rule (2026 revision): any player with 0-3 years NFL
    // experience is individually eligible, at QB/RB/WR/TE/K - meaning a player
    // entering their 1st, 2nd, or 3rd season (years_exp 0, 1, or 2). A player
    // entering their 4th season (years_exp 3, like Jordan Addison in 2026) is
    // NOT eligible. A valid PAIR additionally needs the two players to differ
    // in BOTH years of experience and position - two rookies, two 2nd-years,
    // or two players at the same position (even with different experience)
    // are all invalid. Computed live from years_exp - no per-player hardcoding.
    isNextUpEligibleExperience(yearsExp) {
        const exp = yearsExp || 0;
        return exp >= 0 && exp <= 2;
    }

    // true/false when both players are resolvable, null when one/both can't be
    // determined at all (caller should skip validation in that case, same as the
    // old 'unknown' handling).
    isValidNextUpCombo(a, b) {
        if (!a || !b) return null;
        if (!this.isNextUpEligibleExperience(a.years) || !this.isNextUpEligibleExperience(b.years)) return false;
        if (a.years === b.years) return false;
        if (a.position === b.position) return false;
        return true;
    }

    // Resolves a duo slot's live { years, position }, whether it's the original
    // drafted player or a currently active substitute in that slot. Returns null
    // if the player can't be resolved at all (not a null "years" - see above).
    resolveNextUpExperience(duoPlayer, roster) {
        const playerId = duoPlayer.sleeperId || (roster ? this.findPlayerInRoster(duoPlayer, roster) : null);
        const player = playerId ? this.playersData?.[playerId] : null;
        if (!player) return null;
        return { years: player.years_exp || 0, position: player.position };
    }

    async loadKnownDuos() {
        this.knownDuos = await this.dataLayer.loadKnownDuos();
    }

    async generateCompleteData() {
        await this.initializeLeagueData();

        const seasonYear = Number(process.env.NFL_SEASON_YEAR || '2026');
        const { currentWeek: storedWeek } = await this.dataLayer.loadSeason(seasonYear, this.leagueId);
        await this.loadKnownDuos();

        const currentWeek = await this.getCurrentWeek();
        const currentDay = new Date().getDay(); // 0=Sunday, 1=Monday, 2=Tuesday, 4=Thursday
        const currentHour = new Date().getHours();

        // Determine checkpoint type. Each cron line in the workflow maps to an explicit
        // checkpoint below via CRON_SCHEDULE (github.event.schedule, passed through by the
        // workflow) - this avoids re-deriving "which checkpoint is this" from the runner's
        // server-local day/hour, which is UTC on GitHub Actions and does not line up with the
        // Arizona-time comments the cron schedule was written against. Several scheduled runs
        // (Saturday prep, early Sunday, both Monday slots) previously fell through this check
        // entirely and skipped substitution processing for that run without any error.
        const CRON_CHECKPOINTS = {
            // Standalone checkpoints, outside any game-day window
            '0 14 * * 2': 'TUESDAY_CHECK',                 // Tue 10am ET / 7am AZ - weekly cleanup
            '30 14 * * 4': 'THURSDAY_CHECK',                // Thu 2:30pm AZ - pre-TNF injury checkpoint
            '0 11 * * 6': 'SATURDAY_INTERNATIONAL_PREP',    // Sat 4am AZ - international prep
            '0 11 * * 0': 'SUNDAY_INTERNATIONAL_CHECK',     // Sun 4am AZ - pre-international
            '30 14 * * 1': 'MONDAY_CHECK',                  // Mon 2:30pm AZ - post-game cleanup

            // 15-minute live-score windows - see the matching comment in
            // update-standings.yml for why these windows are this wide.
            // All map to LIVE_CHECK, which gates on whether a game is
            // actually in progress before doing any real work (see below).
            '*/15 23 * * 4': 'LIVE_CHECK',   // Thu night window, part 1
            '*/15 0-4 * * 5': 'LIVE_CHECK',  // Thu night window, part 2 (wraps past UTC midnight)
            '*/15 13-23 * * 0': 'LIVE_CHECK', // Sunday window, part 1
            '*/15 0-4 * * 1': 'LIVE_CHECK',   // Sunday window, part 2 (wraps past UTC midnight)
            '*/15 23 * * 1': 'LIVE_CHECK',    // Monday night window, part 1
            '*/15 0-4 * * 2': 'LIVE_CHECK'    // Monday night window, part 2 (wraps past UTC midnight)
        };

        let checkpointType = null;
        let shouldRunSubstitutions = false;

        if (process.env.FORCE_SUBSTITUTIONS === 'true') {
            checkpointType = 'MANUAL_TRIGGER';
            shouldRunSubstitutions = true;
        } else if (process.env.INTERNATIONAL_CHECK === 'true') {
            checkpointType = 'INTERNATIONAL_CHECK';
            shouldRunSubstitutions = true;
        } else if (process.env.PREGAME_CHECK === 'true') {
            checkpointType = 'PREGAME_CHECK';
            shouldRunSubstitutions = true;
        } else if (process.env.CRON_SCHEDULE && CRON_CHECKPOINTS[process.env.CRON_SCHEDULE]) {
            checkpointType = CRON_CHECKPOINTS[process.env.CRON_SCHEDULE];
            shouldRunSubstitutions = true;
        } else if (process.env.CRON_SCHEDULE) {
            // A scheduled run fired with a cron string we don't recognize (e.g. the
            // workflow's cron list changed but this map wasn't updated) - fail loudly
            // instead of silently skipping substitution processing for the run.
            console.warn(`\u26a0\ufe0f Unrecognized CRON_SCHEDULE "${process.env.CRON_SCHEDULE}" - falling back to day/hour heuristic`);
        }

        // Fallback for manual/local runs with no CRON_SCHEDULE set (e.g. `node update-standings.js`
        // on your machine). Arizona does not observe DST, so AZ = UTC-7 year-round; this mirrors
        // the same slots as CRON_CHECKPOINTS above, corrected to actually cover every day.
        if (!checkpointType) {
            if (currentDay === 2) {
                checkpointType = 'TUESDAY_CHECK';
                shouldRunSubstitutions = true;
            } else if (currentDay === 4) {
                checkpointType = 'THURSDAY_CHECK';
                shouldRunSubstitutions = true;
            } else if (currentDay === 1) {
                checkpointType = 'MONDAY_CHECK';
                shouldRunSubstitutions = true;
            } else if (currentDay === 6) {
                checkpointType = 'SATURDAY_INTERNATIONAL_PREP';
                shouldRunSubstitutions = true;
            } else if (currentDay === 0 && currentHour < 16) { // roughly before ~9am AZ
                checkpointType = 'SUNDAY_INTERNATIONAL_CHECK';
                shouldRunSubstitutions = true;
            } else if (currentDay === 0) {
                checkpointType = 'SUNDAY_PREGAME_CHECK';
                shouldRunSubstitutions = true;
            }
        }

        console.log(`Current week: ${currentWeek}, Checkpoint: ${checkpointType || 'ROUTINE_UPDATE'}`);

        // LIVE_CHECK fires every 15 min across a wide, generous window (see
        // update-standings.yml) - wide enough to safely cover any kickoff
        // time across the season, which means it also wakes up during real
        // dead gaps (an early international game has ended, the noon games
        // haven't started yet). Rather than trying to make the cron schedule
        // itself precise to the minute, the job checks LIVE schedule data
        // here and skips all the real work - Sleeper API calls, Supabase
        // reads/writes - the instant it's clear nothing is actually being
        // played right now. This reuses fetchNFLSchedule's cache, so nothing
        // extra gets fetched if a game IS live and the run proceeds normally.
        if (checkpointType === 'LIVE_CHECK') {
            const liveSchedule = await this.fetchNFLSchedule(currentWeek);
            const anyGameInProgress = !!liveSchedule && Object.values(liveSchedule).some(game => game.status === 'in');
            if (!anyGameInProgress) {
                console.log('LIVE_CHECK: no games currently in progress - skipping this run');
                return {
                    version: '3.0',
                    timestamp: new Date().toISOString(),
                    currentWeek,
                    sleeperLeagueId: this.leagueId,
                    lastCheckpointType: 'LIVE_CHECK_SKIPPED',
                    automationStats: { scoresUpdated: 0, duoSlotChanges: 0, scheduleChangesThisWeek: 0 }
                };
            }
            console.log('LIVE_CHECK: at least one game is in progress - proceeding with a real update');
        }

        // Load existing state from Supabase (replaces the old file-based JSON read)
        const cleanedSubstitutionsRaw = await this.dataLayer.loadSubstitutions();
        const cleanedSubstitutions = this.cleanupSubstitutions(cleanedSubstitutionsRaw, currentWeek);
        const rosterChanges = await this.dataLayer.loadRosterChanges();
        this.managerChanges = await this.dataLayer.loadManagerChanges();

        // Weekly schedule-change check: compares this week's live schedule against the
        // baseline captured at the first checkpoint of the week, flagging any game whose
        // kickoff time moved since (flex scheduling, weather reschedule, etc). This is purely
        // informational - hasPlayerGameStarted() already fetches live schedule data on every
        // checkpoint regardless, so locking behavior doesn't depend on this. It just surfaces
        // the change here instead of you having to notice it in the Action logs.
        const priorSnapshotRecord = await this.dataLayer.loadScheduleSnapshot(currentWeek);
        const priorSnapshotForWeek = priorSnapshotRecord ? priorSnapshotRecord.teams : null;
        const scheduleCheck = await this.checkForScheduleChanges(currentWeek, priorSnapshotForWeek);
        const scheduleSnapshotTeams = priorSnapshotForWeek || scheduleCheck.snapshot;
        const scheduleSnapshotCapturedAt = priorSnapshotRecord ? priorSnapshotRecord.capturedAt : new Date().toISOString();

        const existingWeekChanges = await this.dataLayer.loadScheduleChanges(currentWeek);
        const changeKey = c => `${c.team}|${c.type}|${c.newTime || ''}`;
        const existingChangeKeys = new Set(existingWeekChanges.map(changeKey));
        const newlyDetectedChanges = scheduleCheck.changes.filter(c => !existingChangeKeys.has(changeKey(c)));

        // Update scores
        const existingScoresForFallback = { main: {}, nextup: {} }; // inactive-team historical fallback; see updateAllScores
        const { scores: allScores, playerIds: allPlayerIds, wasBye: allWasBye } = await this.updateAllScores(cleanedSubstitutions, rosterChanges, existingScoresForFallback);

        // Process every duo slot: pre-lock slots are skipped entirely (fully
        // owner-editable), locked slots get the full healthy/temporary/permanent
        // decision tree. This runs the same way regardless of checkpoint type -
        // the old checkpoint-specific dispatch (deep vs light check) belonged to
        // the previous substitutions-layered model and no longer applies now
        // that duos is the single source of truth.
        let slotEvents = [];
        if (shouldRunSubstitutions) {
            slotEvents = await this.processDuoSlots(currentWeek);
            console.log(`${checkpointType}: ${slotEvents.length} duo slot change(s) this run`);
        }

        // Brown Bell weekly bonus matchups - a separate round-robin schedule,
        // scored off this week's Main Award totals (already computed above).
        // Recomputed every run so bonus standings update live through the week,
        // same as everything else - not locked until some explicit finalization step.
        //
        // GATE: only compute/save results once Sleeper actually has real stat
        // data for this week. Before that (pre-season, or just before that
        // week's games start), every team's total is genuinely 0 - not
        // because they tied, but because nothing has been played yet. Without
        // this check, every matchup gets saved as a real "0-0 tie" with
        // real bonus points awarded, which is wrong and (if it already
        // happened on an earlier run before this check existed) needs
        // cleaning up, not just avoiding going forward.
        const weekScoresCheck = await this.getWeeklyScores(currentWeek);
        // Check for genuinely non-zero activity, not just key presence -
        // Sleeper's matchups endpoint can pre-populate every rostered
        // player's entry at 0 points before any games start, rather than
        // returning an empty structure. Checking for keys alone would have
        // treated that pre-populated placeholder data as "the week has
        // started" - it hasn't, every value is a real, uniform zero.
        const weekHasRealData = Object.values(weekScoresCheck).some(points => points > 0);

        if (weekHasRealData) {
            const brownBellWeekTotals = {};
            for (const [teamName, byWeek] of Object.entries(allScores.main || {})) {
                const byIndex = byWeek[currentWeek] || {};
                brownBellWeekTotals[teamName] = Object.values(byIndex).reduce((sum, p) => sum + (p || 0), 0);
            }
            const brownBellMatchups = this.getBrownBellMatchupsForWeek(currentWeek);
            const brownBellBonuses = this.computeBrownBellBonuses(brownBellMatchups, brownBellWeekTotals);

            // Per-matchup finality: a matchup only needs its OWN 4 players
            // (both teams' Main Award duos) to have finished their games -
            // it doesn't need to wait for unrelated games elsewhere in the
            // week (e.g. Monday Night Football) if everyone involved
            // already played Thursday or Sunday. Matches standard fantasy
            // convention at the level that actually matters here: the
            // specific matchup's own record, not the whole week as one unit.
            const weekSchedule = this.cachedSchedule?.[currentWeek] || {};
            const isPlayerDone = (sleeperId) => {
                const player = sleeperId ? this.playersData[sleeperId] : null;
                if (!player || !player.team) return false; // can't resolve - be conservative, don't declare final
                const status = weekSchedule[player.team]?.status;
                return status === 'post' || status === 'bye';
            };

            const matchupIsFinal = {};
            for (const [teamA, teamB] of brownBellMatchups) {
                const playersInvolved = [
                    ...(this.knownDuos.main?.[teamA] || []),
                    ...(this.knownDuos.main?.[teamB] || [])
                ].filter(Boolean);

                // Zero players set on either side means there's no real
                // matchup to speak of yet - don't vacuously call that final.
                const allDone = playersInvolved.length > 0 &&
                    playersInvolved.every(duoPlayer => isPlayerDone(duoPlayer.sleeperId));

                matchupIsFinal[teamA] = allDone;
                matchupIsFinal[teamB] = allDone;
            }

            // A matchup's OWN win/loss is genuinely decided as soon as its own
            // 4 players are done (matchupIsFinal above) - that part doesn't
            // depend on anything else. But the TIER and bonus AMOUNT come from
            // ranking all 6 matchups' winning scores against each other in one
            // shared sort (see computeBrownBellBonuses) - so a team's tier can
            // still shift if a DIFFERENT, still-pending matchup elsewhere in
            // the week later posts a score that reshuffles the ranking. The
            // bonus amount isn't genuinely final until every matchup that
            // week is done, even if this specific one already is.
            const weekBonusIsStable = brownBellMatchups.length > 0 &&
                brownBellMatchups.every(([teamA, teamB]) => matchupIsFinal[teamA] && matchupIsFinal[teamB]);

            const isFinalByTeamName = {};
            for (const teamName of Object.keys(matchupIsFinal)) {
                isFinalByTeamName[teamName] = matchupIsFinal[teamName] && weekBonusIsStable;
            }

            await this.dataLayer.saveBonusResults(currentWeek, brownBellBonuses, isFinalByTeamName);
        } else {
            console.log(`No real score data yet for week ${currentWeek} - skipping bonus computation and clearing any stale results`);
            await this.dataLayer.clearBonusResultsForWeek(currentWeek);
        }

        // Persist everything to Supabase - this replaces the single JSON file write.
        // Substitutions and scores are the actual core of the automation and should
        // always be saved. The schedule-change check is informational on top of that -
        // if the schedule fetch failed entirely (network blip, external API hiccup),
        // that should never take down the whole run, so it's skipped gracefully here
        // rather than trying to save a null snapshot (which the DB correctly rejects).
        //
        // Note: processDuoSlots() above already wrote any new substitution log
        // entries directly via dataLayer.logSubstitution() as they happened - this
        // call only persists cleanupSubstitutions()'s in-memory fixups (e.g. an
        // invalid date range correction) to the existing rows, nothing new.
        await this.dataLayer.saveSubstitutions(cleanedSubstitutions);
        await this.dataLayer.saveWeeklyScores(allScores, allPlayerIds, this.playersData, allWasBye);
        if (scheduleSnapshotTeams) {
            await this.dataLayer.saveScheduleSnapshot(currentWeek, scheduleSnapshotTeams, scheduleSnapshotCapturedAt);
            await this.dataLayer.saveScheduleChanges(currentWeek, newlyDetectedChanges);
        } else {
            console.warn('⚠️ Skipping schedule snapshot/change save - schedule fetch returned no data this run');
        }
        if (currentWeek !== storedWeek) {
            await this.dataLayer.setCurrentWeek(currentWeek);
        }

        const summary = {
            version: '3.0',
            timestamp: new Date().toISOString(),
            currentWeek,
            sleeperLeagueId: this.leagueId,
            lastCheckpointType: checkpointType || 'ROUTINE_UPDATE',
            automationStats: {
                scoresUpdated: Object.keys(allScores.main).length + Object.keys(allScores.nextup).length,
                duoSlotChanges: slotEvents.length,
                scheduleChangesThisWeek: existingWeekChanges.length + newlyDetectedChanges.length
            }
        };

        return summary;
    }

    async testScheduleFetch(week) {
        console.log('\n🧪 TESTING NFL SCHEDULE FETCH\n');

        await this.initializeLeagueData();

        const schedule = await this.fetchNFLSchedule(week);

        if (!schedule) {
            console.log('❌ Failed to fetch schedule');
            return;
        }

        console.log(`\n📋 Week ${week} Schedule Summary:`);
        console.log(`Total teams: ${Object.keys(schedule).length}`);

        // Group by game time
        const games = {};
        Object.entries(schedule).forEach(([team, info]) => {
            if (info.date === null) {
                console.log(`🏖️ ${team}: BYE WEEK`);
            } else {
                const dateKey = info.date.toISOString();
                if (!games[dateKey]) games[dateKey] = [];
                games[dateKey].push(team);
            }
        });

        // Show games in chronological order
        const sortedTimes = Object.keys(games).sort();
        sortedTimes.forEach(time => {
            const date = new Date(time);
            const teams = games[time];
            console.log(`\n⏰ ${date.toLocaleString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/New_York'
            })} ET`);
            console.log(`   Teams: ${teams.join(', ')}`);
        });

        // Test game started logic for a few teams
        console.log('\n🔍 Testing Game Started Logic:');
        const testTeams = ['PIT', 'CIN', 'BAL', 'BUF'];
        for (const team of testTeams) {
            // Find a player from this team
            const player = Object.values(this.playersData).find(p => p.team === team);
            if (player) {
                const hasStarted = await this.hasPlayerGameStarted(player.player_id, week);
                const status = schedule[team];
                console.log(`${team} (${player.first_name} ${player.last_name}): Game started = ${hasStarted}, Status = ${status?.date ? 'Playing' : 'BYE'}`);
            }
        }
    }

    async run() {
        try {
            console.log('🏈 Starting Brown Bell automation...');

            // generateCompleteData() persists everything to Supabase itself - there is
            // no file to write here anymore, just the run summary for the Action log.
            const data = await this.generateCompleteData();

            console.log('✅ Automation complete!');
            console.log(`📊 Updated ${data.automationStats.scoresUpdated} team scores`);
            console.log(`🔄 ${data.automationStats.duoSlotChanges} duo slot change(s) this run`);
            console.log(`📅 Schedule changes flagged this week: ${data.automationStats.scheduleChangesThisWeek}`);
            console.log(`📅 Current week: ${data.currentWeek}`);

            return data;

        } catch (error) {
            console.error('❌ Automation failed:', error);
            throw error;
        }
    }
}

// Run automation
const leagueId = process.env.SLEEPER_LEAGUE_ID || '1313661584425385984'; // 2026 season
const automator = new BrownBellAutomator(leagueId);

if (require.main === module) {
    // TEST MODE: Set environment variable to test schedule fetch
    if (process.env.TEST_SCHEDULE === 'true') {
        const testWeek = parseInt(process.env.TEST_WEEK || '7');
        automator.testScheduleFetch(testWeek)
            .then(() => process.exit(0))
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    } else {
        // Normal automation
        automator.run()
            .then(() => process.exit(0))
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    }
}

module.exports = BrownBellAutomator;