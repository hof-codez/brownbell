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
    async selectAutoReplacement(teamName, awardType, week, excludeSleeperIds, otherSlotInfo) {
        const roster = this.leagueData.rosters.find(r => this.leagueData.userMap[r.owner_id] === teamName);
        if (!roster) {
            console.warn(`No roster found for ${teamName} - cannot select a replacement`);
            return null;
        }

        const validPositions = awardType === 'nextup'
            ? ['QB', 'RB', 'WR', 'TE', 'K']
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

            // Can't add someone whose own game for this week has already started
            if (await this.hasPlayerGameStarted(playerId, week)) continue;

            if (awardType === 'nextup' && !this.isNextUpEligibleExperience(player.years_exp || 0)) continue;

            if (otherSlotInfo) {
                const candidateInfo = { position: player.position, yearsExp: player.years_exp || 0 };
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

    // The core decision engine for the duos-as-source-of-truth model. For every
    // duo slot: skip if not locked yet (pre-lock is fully owner-editable, the
    // automation stays out of it entirely). Once locked, freeze the original
    // player one time. Then classify: still rostered + healthy -> do nothing;
    // still rostered + genuinely injured -> temporary (unconditional, unlimited,
    // auto-reverts to the frozen original once they're healthy again); not on
    // the roster at all -> permanent (trade/release), gated by the team's
    // 2-swap season budget - 1st time leaves the slot open for the owner, 2nd
    // time auto-fills immediately and revokes manual privilege for the rest of
    // the season.
    async processDuoSlots(week) {
        const duoRows = await this.dataLayer.loadDuoRows();
        const events = [];

        const byTeamAward = {};
        for (const row of duoRows) {
            const key = `${row.teamName}|${row.awardType}`;
            byTeamAward[key] = byTeamAward[key] || {};
            byTeamAward[key][row.playerIndex] = row;
        }

        for (const row of duoRows) {
            if (!row.sleeperPlayerId) continue;

            const player = this.playersData[row.sleeperPlayerId];
            if (!player) {
                console.warn(`Could not resolve player ${row.sleeperPlayerId} for ${row.teamName}/${row.awardType}`);
                continue;
            }

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
                    yearsExp: this.playersData[pairRow.sleeperPlayerId]?.years_exp || 0
                }
                : null;
            const excludeIds = [row.sleeperPlayerId, pairRow?.sleeperPlayerId].filter(Boolean);

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
                    }
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

    // Shared by every checkpoint path (Tuesday/Thursday full check, Sunday pregame,
    // and international game check) so a dropped/injured substitute is always caught
    // and always actually replaced, no matter which checkpoint happens to run.
    // Mutates matching objects inside existingSubstitutions in place (endWeek), and
    // returns the injuredSubs list plus any forced replacement/no-replacement records.
    async resolveDroppedOrInjuredSubs(week, existingSubstitutions) {
        const injuredSubs = await this.detectSubstituteInjuries(week, existingSubstitutions);
        const forcedSubstitutions = [];

        if (injuredSubs.length > 0) {
            console.log(`⚠️ Found ${injuredSubs.length} injured/dropped substitutes - will replace them`);
        }

        for (const injuredSub of injuredSubs) {
            console.log(`\n🔄 FORCING REPLACEMENT for dropped substitute: ${injuredSub.substituteName} (${injuredSub.teamName} - ${injuredSub.awardType})`);
            console.log(`   Substitute: ${injuredSub.substituteName} (ID: ${injuredSub.substitutePlayerId})`);
            console.log(`   Team: ${injuredSub.teamName}`);
            console.log(`   Original: ${injuredSub.originalName}`);
            console.log(`   Award: ${injuredSub.awardType}`);

            // FIRST: Check if the ORIGINAL player still needs a substitute
            const roster = this.leagueData.rosters.find(r =>
                this.leagueData.userMap[r.owner_id] === injuredSub.teamName
            );

            if (roster) {
                // Find the original player in the duo
                const originalDuo = this.knownDuos[injuredSub.awardType][injuredSub.teamName];
                const originalPlayer = originalDuo[injuredSub.playerIndex];
                const originalPlayerId = this.findPlayerInRoster(originalPlayer, roster);

                if (originalPlayerId) {
                    const player = this.playersData[originalPlayerId];

                    // Check if original player is still injured enough to need a sub
                    let stillNeedsSub = false;
                    if (player.injury_status) {
                        const status = player.injury_status.toLowerCase();
                        if (['out', 'doubtful', 'ir', 'pup'].includes(status)) {
                            stillNeedsSub = true;
                        }
                    }

                    // Also check if on bye
                    if (await this.isPlayerOnBye(originalPlayerId, week)) {
                        stillNeedsSub = true;
                    }

                    if (!stillNeedsSub) {
                        console.log(`✅ Original player ${originalPlayer.name} is healthy/questionable - no replacement needed`);

                        // End the dropped substitution
                        const oldSubInList = existingSubstitutions.find(s =>
                            s.teamName === injuredSub.teamName &&
                            s.playerIndex === injuredSub.playerIndex &&
                            s.awardType === injuredSub.awardType &&
                            s.startWeek === injuredSub.startWeek
                        );

                        if (oldSubInList && !oldSubInList.endWeek) {
                            console.log(`📅 Ending substitution: ${injuredSub.substituteName} at Week ${week - 1}`);
                            oldSubInList.endWeek = week - 1;
                        }

                        continue; // Skip to next injured sub - don't find a replacement
                    }

                    console.log(`⚠️ Original player ${originalPlayer.name} is ${player.injury_status || 'on bye'} - finding replacement`);
                }
            }

            // Create a fake "injury" object for the substitute
            const forcedInjury = {
                originalPlayer: {
                    name: injuredSub.originalName,
                    position: injuredSub.originalPosition
                },
                playerId: null,
                index: injuredSub.playerIndex,
                status: 'substitute_dropped'
            };

            // Find a new substitute
            const newSubstitute = await this.findSubstitute(
                injuredSub.teamName,
                forcedInjury,
                week,
                injuredSub.awardType
            );

            // End the dropped/injured sub regardless of whether we find a replacement -
            // it must never keep counting as the active substitute past this point.
            const oldSubInList = existingSubstitutions.find(s =>
                s.teamName === injuredSub.teamName &&
                s.playerIndex === injuredSub.playerIndex &&
                s.awardType === injuredSub.awardType &&
                s.startWeek === injuredSub.startWeek
            );

            if (oldSubInList && !oldSubInList.endWeek) {
                console.log(`📅 Ending dropped/injured substitution: ${injuredSub.substituteName} at Week ${week - 1}`);
                oldSubInList.endWeek = week - 1;
            }

            if (newSubstitute) {
                console.log(`✅ Found replacement: ${newSubstitute.name}`);

                forcedSubstitutions.push({
                    teamName: injuredSub.teamName,
                    playerIndex: injuredSub.playerIndex,
                    awardType: injuredSub.awardType,
                    originalName: injuredSub.originalName,
                    originalPosition: injuredSub.originalPosition,
                    substituteName: newSubstitute.name,
                    substitutePlayerId: newSubstitute.id,
                    substitutePosition: newSubstitute.position,
                    startWeek: week,
                    endWeek: injuredSub.awardType === 'main' ? week : null,
                    active: true,
                    autoGenerated: true,
                    reason: `Substitute Replaced (was dropped/injured): ${injuredSub.substituteName} \u2192 ${newSubstitute.name}`
                });

                console.log(`✅ Replacement recorded: ${injuredSub.teamName} ${injuredSub.awardType} - ${newSubstitute.name} for ${injuredSub.originalName}`);
            } else {
                console.log(`❌ No replacement found for ${injuredSub.substituteName}`);

                // Create a "no replacement" marker
                forcedSubstitutions.push({
                    teamName: injuredSub.teamName,
                    playerIndex: injuredSub.playerIndex,
                    awardType: injuredSub.awardType,
                    originalName: injuredSub.originalName,
                    originalPosition: injuredSub.originalPosition,
                    substituteName: `No Eligible Substitute for ${injuredSub.originalPosition}, ${injuredSub.originalName}`,
                    substitutePlayerId: null,
                    substitutePosition: null,
                    startWeek: week,
                    endWeek: week,
                    active: false,
                    autoGenerated: true,
                    reason: 'No Eligible Replacement on Roster',
                    noReplacementAvailable: true,
                    noSubBadge: true
                });

                console.log(`⚠️ Marked ${injuredSub.teamName} ${injuredSub.awardType} as having no available replacement`);
            }
        }

        return { injuredSubs, forcedSubstitutions };
    }

    async generateWeeklySubstitutions(week, existingSubstitutions) {
        console.log(`🔄 Generating weekly substitutions for week ${week}...`);

        const weeklySubstitutions = [];

        const { injuredSubs, forcedSubstitutions } = await this.resolveDroppedOrInjuredSubs(week, existingSubstitutions);
        weeklySubstitutions.push(...forcedSubstitutions);

        const injuries = await this.detectInjuries(week);

        console.log(`📋 Injuries detected:`, JSON.stringify(injuries, null, 2));

        for (const awardType of ['main', 'nextup']) {
            console.log(`\n🏆 Processing ${awardType} award...`);

            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                console.log(`\n👥 Team: ${teamName} - ${teamInjuries.length} injuries`);

                for (const injury of teamInjuries) {
                    console.log(`\n🤕 Injured: ${injury.originalPlayer.name} (${injury.status})`);

                    // Check exclusion list first
                    const isExcluded = this.substitutionExclusions.some(excl =>
                        excl.teamName === teamName &&
                        excl.awardType === awardType &&
                        excl.playerIndex === injury.index
                    );

                    if (isExcluded) {
                        console.log(`⛔ Substitution excluded: ${teamName} ${awardType} player ${injury.index} - no eligible substitutes`);
                        continue;
                    }

                    // Check if injured player is on bye week - allow sub but mark it
                    const isOnBye = await this.isPlayerOnBye(injury.playerId, week);
                    if (isOnBye) {
                        console.log(`⚠️ ${injury.originalPlayer.name} is on bye week ${week} - will mark substitute with Bye-Sub badge`);
                    }

                    // Check if we already have an active substitution for this exact scenario
                    const hasActiveSub = this.hasActiveSubstitution(
                        teamName, injury.index, week, awardType, existingSubstitutions
                    );

                    if (hasActiveSub) {
                        console.log(`✅ Substitution already exists: ${teamName} ${awardType} player ${injury.index} week ${week}`);
                        continue;
                    }

                    // Only create new substitution if none exists
                    console.log(`🔎 Calling findSubstitute for ${teamName}...`);
                    const substitute = await this.findSubstitute(teamName, injury, week, awardType);

                    if (substitute) {
                        console.log(`✅ Found substitute: ${substitute.name}`);

                        // Check if we're replacing an injured substitute
                        const wasReplacingSub = injuredSubs.some(injured =>
                            injured.teamName === teamName &&
                            injured.playerIndex === injury.index &&
                            injured.awardType === awardType
                        );

                        const reason = wasReplacingSub
                            ? `Substitute Injured - Replacement (${injury.status})`
                            : `Injury Checkpoint (3) - ${injury.status}`;

                        // NEW: Check if we're replacing a sub due to bye week (temporary replacement)
                        // (explicit loop, not .some() - isPlayerOnBye is async and .some()
                        // can't await, a Promise is always truthy so .some() would short-circuit wrong)
                        let replacingSubDueToBye = false;
                        for (const injured of injuredSubs) {
                            if (injured.teamName === teamName &&
                                injured.playerIndex === injury.index &&
                                injured.awardType === awardType &&
                                await this.isPlayerOnBye(injured.substitutePlayerId, week)) {
                                replacingSubDueToBye = true;
                                break;
                            }
                        }

                        // If replacing a sub, handle differently based on why
                        if (wasReplacingSub) {
                            const previousSub = existingSubstitutions.find(s =>
                                s.teamName === teamName &&
                                s.playerIndex === injury.index &&
                                s.awardType === awardType &&
                                s.startWeek < week &&
                                (!s.endWeek || s.endWeek >= week)
                            );

                            if (previousSub && !previousSub.endWeek) {
                                // If previous sub is on bye, DON'T end it - just pause it for this week
                                if (replacingSubDueToBye) {
                                    console.log(`⏸️ Pausing substitution: ${previousSub.substituteName} for Week ${week} (bye week) - will resume Week ${week + 1}`);
                                    // Don't set endWeek - let it remain active
                                    // The new sub will be temporary (endWeek = week)
                                } else {
                                    // Previous sub is injured/dropped permanently - end it
                                    console.log(`📅 Ending previous substitution: ${previousSub.substituteName} at Week ${week - 1}`);
                                    previousSub.endWeek = week - 1;
                                }
                            }
                        }

                        // Check if we already created a substitution for this exact scenario
                        const alreadyExists = weeklySubstitutions.some(sub =>
                            sub.teamName === teamName &&
                            sub.playerIndex === injury.index &&
                            sub.awardType === awardType &&
                            sub.startWeek === week
                        );

                        if (!alreadyExists) {
                            // Determine if this is a temporary bye week replacement
                            const isTempByeReplacement = replacingSubDueToBye;

                            weeklySubstitutions.push({
                                teamName,
                                playerIndex: injury.index,
                                awardType,
                                originalName: injury.originalPlayer.name,
                                originalPosition: injury.originalPlayer.position,
                                substituteName: substitute.name,
                                substitutePlayerId: substitute.id,
                                substitutePosition: substitute.position,
                                startWeek: week,
                                endWeek: isTempByeReplacement ? week : (awardType === 'main' ? week : null),  // End this week if temp bye replacement
                                active: true,
                                autoGenerated: true,
                                reason: isTempByeReplacement ? `Temporary Bye Week Replacement (Week ${week})` : reason,
                                byeWeekSub: isOnBye,
                                isTemporaryByeReplacement: isTempByeReplacement
                            });

                            console.log(`✅ New auto-sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name} (Week ${week})`);
                        } else {
                            console.log(`⏭️ Skipping duplicate auto-sub for ${teamName} ${awardType}`);
                        }
                    } else {
                        console.log(`❌ No suitable substitute found: ${teamName} ${awardType} for ${injury.originalPlayer.name}`);

                        // Create a "no replacement available" marker
                        const alreadyMarked = weeklySubstitutions.some(sub =>
                            sub.teamName === teamName &&
                            sub.playerIndex === injury.index &&
                            sub.awardType === awardType &&
                            sub.startWeek === week &&
                            sub.noReplacementAvailable === true
                        );

                        if (!alreadyMarked) {
                            weeklySubstitutions.push({
                                teamName,
                                playerIndex: injury.index,
                                awardType,
                                originalName: injury.originalPlayer.name,
                                originalPosition: injury.originalPlayer.position,
                                substituteName: `No Eligible Substitute for ${injury.originalPlayer.position}, ${injury.originalPlayer.name}`,
                                substitutePlayerId: null,
                                substitutePosition: null,
                                startWeek: week,
                                endWeek: week,
                                active: false,
                                autoGenerated: true,
                                reason: 'No Eligible Replacement on Roster',
                                noReplacementAvailable: true,
                                noSubBadge: true
                            });

                            console.log(`⚠️ Marked ${teamName} ${awardType} as having no available replacement`);
                        }
                    }
                }
            }
        }

        return weeklySubstitutions;
    }

    cleanupSubstitutions(substitutions, currentWeek) {
        // Remove invalid substitutions
        const validSubstitutions = substitutions.filter(sub => {
            // Fix invalid date ranges
            if (sub.endWeek && sub.endWeek < sub.startWeek) {
                console.log(`🔧 Fixing invalid date range for ${sub.substituteName}`);
                sub.endWeek = null;
            }

            // DON'T remove manual trade subs - ADD THIS CHECK
            if (sub.isManualSubForTrade === true) {
                return true; // Always keep trade subs
            }

            // Remove future substitutions
            if (sub.startWeek > currentWeek) {
                console.log(`🗑️ Removing future substitution: ${sub.substituteName} (starts Week ${sub.startWeek})`);
                return false;
            }

            return true;
        });

        console.log(`✅ Validated ${validSubstitutions.length} substitutions (removed ${substitutions.length - validSubstitutions.length})`);
        return validSubstitutions;
    }

    isPlayerInNextUpDuo(playerId, teamName) {
        const nextUpDuo = this.knownDuos.nextup[teamName];
        if (!nextUpDuo) {
            console.log(`No Next Up duo found for team: ${teamName}`);
            return false;
        }

        const roster = this.leagueData.rosters.find(r =>
            this.leagueData.userMap[r.owner_id] === teamName
        );
        if (!roster) {
            console.log(`No roster found for team: ${teamName}`);
            return false;
        }

        console.log(`Checking if player ${playerId} is in Next Up duo for ${teamName}`);
        console.log(`Next Up duo: ${nextUpDuo.map(p => p.name).join(', ')}`);

        // Check if this player is in the Next Up duo
        const isInDuo = nextUpDuo.some(nextUpPlayer => {
            const nextUpPlayerId = this.findPlayerInRoster(nextUpPlayer, roster);
            console.log(`  Checking ${nextUpPlayer.name}: Sleeper ID ${nextUpPlayerId} vs ${playerId}`);
            return nextUpPlayerId === playerId;
        });

        console.log(`Player ${playerId} in Next Up duo: ${isInDuo}`);
        return isInDuo;
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
        console.log(`⚠️ No schedule data for ${nflTeam} Week ${week}, using fallback`);
        const dayOfWeek = now.getDay();
        return (dayOfWeek === 1 || dayOfWeek === 2); // Mon/Tue = week over
    }

    async fetchNFLSchedule(week) {
        console.log(`📅 Fetching NFL schedule for Week ${week}...`);

        try {
            const season = process.env.NFL_SEASON_YEAR || '2026';
            // ESPN's public scoreboard endpoint - structured JSON, kept live in sync with
            // actual broadcast schedule (flex moves, weather reschedules, etc), unlike the
            // old approach of regex-scraping the NFL.com operations page HTML, which was
            // fragile and hardcoded to the 2025 season page.
            const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`;
            const data = await this.fetchJson(url);

            const weekSchedule = this.parseEspnSchedule(data);

            // Cache it for this run only (a fresh process runs on every checkpoint, so this
            // never goes stale across checkpoints - each run re-fetches live).
            this.cachedSchedule = this.cachedSchedule || {};
            this.cachedSchedule[week] = weekSchedule;

            console.log(`✅ Successfully fetched schedule for Week ${week} - ${Object.keys(weekSchedule).length} teams`);
            return weekSchedule;

        } catch (error) {
            console.warn(`⚠️ Failed to fetch NFL schedule: ${error.message}`);
            console.log('Falling back to manual schedule data');
            return null;
        }
    }

    // ESPN uses a couple of team abbreviations that differ from the ones used elsewhere in
    // this file (byeWeeks, knownDuos, roster/player data, etc). Normalize here.
    static ESPN_ABBR_FIX = { WSH: 'WAS' };

    // Full 32-team list, in the same abbreviation convention used elsewhere in this file
    // (byeWeeks, knownDuos, etc). Used to detect byes explicitly, since ESPN's scoreboard
    // simply omits a bye team rather than listing them - a team missing from `events` is
    // otherwise indistinguishable from "the fetch failed."
    static ALL_NFL_TEAMS = [
        'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
        'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
        'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'
    ];

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

    // Weekly check: compares this week's live schedule against the snapshot taken earlier
    // in the week (stored via Supabase's schedule_snapshots table) and flags any game whose kickoff time
    // moved - flex scheduling, weather reschedule, etc. This is purely for visibility -
    // hasPlayerGameStarted() already fetches the live schedule fresh on every checkpoint,
    // so locking behavior is correct regardless. This just surfaces the change so you don't
    // have to notice it by digging through Action logs.
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
                console.warn(`🚨 SCHEDULE CHANGE DETECTED for Week ${week}:`);
                changes.forEach(c => {
                    if (c.type === 'TIME_CHANGED') {
                        console.warn(`   ${c.team} vs ${c.opponent}: ${c.previousTime} → ${c.newTime} (moved ${c.diffMinutes} min)`);
                    } else {
                        console.warn(`   ${c.team}: ${c.type}`);
                    }
                });
            } else {
                console.log(`✅ No schedule changes detected for Week ${week} since last snapshot`);
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

    async fetchHtml(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    parseNFLSchedule(html, targetWeek) {
        const schedule = {};

        console.log(`Parsing schedule for Week ${targetWeek}...`);

        // NFL team abbreviation mapping
        const teamAbbreviations = {
            'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
            'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
            'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
            'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
            'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
            'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
            'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
            'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
            'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
            'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
            'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
        };

        // Extract week section
        const weekPattern = new RegExp(`WEEK ${targetWeek}[\\s\\S]*?(?=WEEK ${targetWeek + 1}|Week ${targetWeek + 1}|$)`, 'i');
        const weekMatch = html.match(weekPattern);

        if (!weekMatch) {
            console.warn(`❌ Could not find Week ${targetWeek}`);
            return schedule;
        }

        const weekSection = weekMatch[0];

        // Strip HTML tags and decode entities
        const cleanText = weekSection
            .replace(/<[^>]+>/g, '\n')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        let currentDate = null;

        for (let i = 0; i < cleanText.length; i++) {
            const line = cleanText[i];

            // Check for date line
            const dateMatch = line.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\.\s+(\d{1,2}),\s+(\d{4})/);
            if (dateMatch) {
                currentDate = {
                    day: dateMatch[1],
                    month: dateMatch[2],
                    dayNum: parseInt(dateMatch[3]),
                    year: parseInt(dateMatch[4])
                };
                continue;
            }

            // Check for team matchup (include digits for teams like "49ers")
            const gameMatch = line.match(/^([A-Za-z\d\s]+?)\s+(?:at|vs)\s+([A-Za-z\d\s]+?)(?:\s*\(([^)]+)\))?$/);
            if (gameMatch && currentDate) {
                const team1Full = gameMatch[1].trim();
                const team2Full = gameMatch[2].trim();

                // Look for time in next few lines
                let timeStr = null;
                let timezone = null;

                for (let j = i + 1; j < Math.min(i + 5, cleanText.length); j++) {
                    const timeLine = cleanText[j];
                    const timeMatch = timeLine.match(/^(\d{1,2}:\d{2}[ap])\s*\(([A-Z]+)\)$/);
                    if (timeMatch) {
                        timeStr = timeMatch[1];
                        timezone = timeMatch[2];
                        break;
                    }
                }

                if (timeStr && timezone) {
                    const team1 = teamAbbreviations[team1Full];
                    const team2 = teamAbbreviations[team2Full];

                    if (team1 && team2) {
                        const gameDate = this.convertGameTimeToUTC(
                            timeStr,
                            timezone,
                            currentDate.year,
                            currentDate.month,
                            currentDate.dayNum
                        );

                        if (gameDate) {
                            schedule[team1] = { date: gameDate, opponent: team2 };
                            schedule[team2] = { date: gameDate, opponent: team1 };
                        }
                    }
                }
            }

            // Check for BYES
            if (line.startsWith('BYES:')) {
                const byeText = line.substring(5);
                const byeTeams = byeText.split(',').map(t => t.trim());
                byeTeams.forEach(teamName => {
                    let abbr = null;
                    Object.entries(teamAbbreviations).forEach(([fullName, teamAbbr]) => {
                        if (fullName.includes(teamName) || teamName.includes(fullName)) {
                            abbr = teamAbbr;
                        }
                    });

                    if (abbr) {
                        schedule[abbr] = { date: null, opponent: null };
                    }
                });
            }
        }

        console.log(`✅ Fetched schedule for ${Object.keys(schedule).length} teams`);
        return schedule;
    }

    convertGameTimeToUTC(timeStr, timezone, year, month, day) {
        try {
            // Parse time (e.g., "8:15p" -> 20:15)
            const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})([ap])/);
            if (!timeMatch) {
                console.warn(`Invalid time format: ${timeStr}`);
                return null;
            }

            let hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const period = timeMatch[3];

            // Convert to 24-hour format
            if (period === 'p' && hours !== 12) hours += 12;
            if (period === 'a' && hours === 12) hours = 0;

            // Timezone offsets from UTC (negative = behind UTC, positive = ahead of UTC)
            const timezoneOffsets = {
                'ET': -4,  // Eastern Daylight Time (Oct = still daylight)
                'CT': -5,  // Central Daylight Time
                'MT': -6,  // Mountain Daylight Time
                'PT': -7,  // Pacific Daylight Time
                'BRT': -3, // Brazil Time
                'BST': +1, // British Summer Time
                'IST': +1, // Irish Standard Time
                'CET': +2  // Central European Summer Time
            };

            const offset = timezoneOffsets[timezone];
            if (offset === undefined) {
                console.warn(`Unknown timezone: ${timezone}`);
                return null;
            }

            // Month conversion
            const monthMap = {
                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                'Jul': 6, 'Aug': 7, 'Sep': 8, 'Sept': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
            };

            const monthNum = monthMap[month];
            if (monthNum === undefined) {
                console.warn(`Unknown month: ${month}`);
                return null;
            }

            // Convert game time to UTC
            // If game is at 8:15 PM ET (hours=20), and ET is UTC-4,
            // then UTC time is 20 - (-4) = 24 = 0 hours next day
            let utcHours = hours - offset;
            let utcDay = day;

            // Handle day rollover
            if (utcHours >= 24) {
                utcHours -= 24;
                utcDay += 1;
            } else if (utcHours < 0) {
                utcHours += 24;
                utcDay -= 1;
            }

            // Create UTC date
            const utcDate = new Date(Date.UTC(year, monthNum, utcDay, utcHours, minutes, 0));

            return utcDate;

        } catch (error) {
            console.error(`Error converting time: ${error.message}`);
            return null;
        }
    }

    async checkGameTimeInjuries(existingSubstitutions) {
        console.log('Checking for last-minute injury updates...');

        const currentWeek = await this.getCurrentWeek();

        // existingSubstitutions must be the SAME array/object-references generateCompleteData
        // is already holding (cleanedSubstitutions), not a fresh independent read of the file -
        // otherwise any endWeek mutation made here gets silently discarded on write-out.
        existingSubstitutions = existingSubstitutions || [];

        // Always re-check active substitutes against the live roster first. This used to only
        // run on the Tuesday/Thursday full checkpoint, so a substitute dropped mid-week could
        // sit "active" through every Sunday pregame check until the next Tuesday/Thursday run.
        const { forcedSubstitutions } = await this.resolveDroppedOrInjuredSubs(currentWeek, existingSubstitutions);
        const newSubstitutions = [...forcedSubstitutions];

        const injuries = await this.detectInjuries(currentWeek);

        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                for (const injury of teamInjuries) {
                    // Check if we already have a substitution for this week
                    const hasActiveSub = this.hasActiveSubstitution(
                        teamName, injury.index, currentWeek, awardType, existingSubstitutions
                    );

                    if (!hasActiveSub && ['out', 'doubtful', 'season_ending'].includes(injury.status)) {
                        const substitute = await this.findSubstitute(teamName, injury, currentWeek, awardType);

                        if (substitute) {
                            newSubstitutions.push({
                                teamName,
                                playerIndex: injury.index,
                                awardType,
                                originalName: injury.originalPlayer.name,
                                originalPosition: injury.originalPlayer.position,
                                substituteName: substitute.name,
                                substitutePlayerId: substitute.id,
                                substitutePosition: substitute.position,
                                startWeek: currentWeek,
                                endWeek: awardType === 'main' ? currentWeek : null,
                                active: true,
                                autoGenerated: true,
                                reason: `Injury Checkpoint (2) - ${injury.status}`
                            });

                            console.log(`Pre-game sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name}`);
                        }
                    }
                }
            }
        }

        return newSubstitutions;
    }

    async checkInternationalGameInjuries(existingSubstitutions) {
        console.log('Checking for international game injury updates...');

        const currentWeek = await this.getCurrentWeek();

        // existingSubstitutions must be the SAME array/object-references generateCompleteData
        // is already holding (cleanedSubstitutions), not a fresh independent read of the file -
        // otherwise any endWeek mutation made here gets silently discarded on write-out.
        existingSubstitutions = existingSubstitutions || [];

        // Roster-drop check always runs first, regardless of whether this week has an
        // international game - a dropped substitute needs replacing either way.
        const { forcedSubstitutions } = await this.resolveDroppedOrInjuredSubs(currentWeek, existingSubstitutions);

        // Which teams (if any) are playing internationally this week - derived live from
        // the schedule's venue data (see parseEspnSchedule), not a hand-maintained list.
        // No separate fetch needed: resolveDroppedOrInjuredSubs already populated
        // this.cachedSchedule[currentWeek] via hasPlayerGameStarted's schedule lookups.
        const weekSchedule = this.cachedSchedule?.[currentWeek] || await this.fetchNFLSchedule(currentWeek) || {};
        const teamsInInternationalGames = Object.entries(weekSchedule)
            .filter(([, game]) => game.international)
            .map(([team]) => team);

        if (teamsInInternationalGames.length === 0) {
            console.log(`No international games in Week ${currentWeek}`);
            return forcedSubstitutions;
        }

        console.log(`International games this week: ${teamsInInternationalGames.join(', ')}`);

        // Enhanced injury detection for international game teams
        const injuries = await this.detectInjuries(currentWeek);
        const newSubstitutions = [...forcedSubstitutions];

        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                for (const injury of teamInjuries) {
                    // Check if we already have a substitution for this week
                    const hasActiveSub = this.hasActiveSubstitution(
                        teamName, injury.index, currentWeek, awardType, existingSubstitutions
                    );

                    if (!hasActiveSub && ['out', 'doubtful', 'season_ending'].includes(injury.status)) {
                        const substitute = await this.findSubstitute(teamName, injury, currentWeek, awardType);

                        if (substitute) {
                            newSubstitutions.push({
                                teamName,
                                playerIndex: injury.index,
                                awardType,
                                originalName: injury.originalPlayer.name,
                                originalPosition: injury.originalPlayer.position,
                                substituteName: substitute.name,
                                substitutePlayerId: substitute.id,
                                substitutePosition: substitute.position,
                                startWeek: currentWeek,
                                endWeek: awardType === 'main' ? currentWeek : null,
                                active: true,
                                autoGenerated: true,
                                reason: `Injury Checkpoint (1) - ${injury.status}`
                            });

                            console.log(`International game sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name}`);
                        }
                    }
                }
            }
        }

        return newSubstitutions;
    }

    async updateAllScores(existingSubstitutions, rosterChanges, existingScores) {
        console.log('Updating all weekly scores...');

        const currentWeek = await this.getCurrentWeek();
        const scores = { main: {}, nextup: {} };
        const playerIds = { main: {}, nextup: {} };

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

                    for (let index = 0; index < originalDuo.length; index++) {
                        const originalPlayer = originalDuo[index];
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
                        let activeSub = activeSubstitutions.find(sub => sub.isTemporaryByeReplacement === true);

                        // If no temporary bye replacement, find other temporary subs
                        if (!activeSub) {
                            activeSub = activeSubstitutions.find(sub => sub.endWeek !== null && !sub.isTemporaryByeReplacement);
                        }

                        // If no temporary subs, use permanent sub
                        if (!activeSub) {
                            activeSub = activeSubstitutions.find(sub => sub.endWeek === null);
                        }

                        let playerId;

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
                                continue;
                            }
                            playerId = this.findPlayerInRoster(originalPlayer, roster);
                        }

                        playerIds[awardType][teamName][week][index] = playerId || null;

                        if (playerId && weekScores[playerId] !== undefined) {
                            // Check if this player is on bye this week
                            if (await this.isPlayerOnBye(playerId, week)) {
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
                            scores[awardType][teamName][week][index] = 0;
                            if (activeSub) {
                                console.log(`No score found for substitute ${activeSub.substituteName} (${playerId})`);
                            }
                        }
                    }

                    // Validate Next Up Award combinations after scores are set
                    if (awardType === 'nextup') {
                        // Get both players' current { years, position } for this week
                        const player1Experience = this.getPlayerExperienceForWeek(teamName, 0, week, existingSubstitutions);
                        const player2Experience = this.getPlayerExperienceForWeek(teamName, 1, week, existingSubstitutions);

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

        return { scores, playerIds };
    }

    getPlayerExperienceForWeek(teamName, playerIndex, week, existingSubstitutions) {
        const originalDuo = this.knownDuos.nextup[teamName];
        if (!originalDuo) return null;

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
    // experience is individually eligible, at QB/RB/WR/TE/K. A valid PAIR additionally
    // needs the two players to differ in BOTH years of experience and position - two
    // rookies, two 2nd-years, or two players at the same position (even with
    // different experience) are all invalid. Computed live from years_exp - no
    // per-player hardcoding.
    isNextUpEligibleExperience(yearsExp) {
        const exp = yearsExp || 0;
        return exp >= 0 && exp <= 3;
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
            '0 14 * * 2': 'TUESDAY_CHECK',                 // Tue 10am ET / 7am AZ
            '30 14 * * 4': 'THURSDAY_CHECK',                // Thu 2:30pm AZ - injury checkpoint
            '0 3 * * 5': 'THURSDAY_CHECK',                  // Thu 8pm AZ - post-TNF scores
            '0 11 * * 6': 'SATURDAY_INTERNATIONAL_PREP',    // Sat 4am AZ - international prep
            '0 11 * * 0': 'SUNDAY_INTERNATIONAL_CHECK',     // Sun 4am AZ - pre-international
            '0 16 * * 0': 'SUNDAY_INTERNATIONAL_CHECK',     // Sun 9am AZ - pre-AM games
            '5 19 * * 0': 'SUNDAY_PREGAME_CHECK',           // Sun 12:05pm AZ - post-AM games
            '0 23 * * 0': 'SUNDAY_PREGAME_CHECK',           // Sun 4pm AZ - post-evening games
            '0 4 * * 1': 'MONDAY_CHECK',                    // Sun 9pm AZ - post-SNF
            '30 14 * * 1': 'MONDAY_CHECK',                  // Mon 2:30pm AZ - post-game cleanup
            '0 3 * * 2': 'MONDAY_CHECK'                     // Mon 8pm AZ - post-MNF scores
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
        const { scores: allScores, playerIds: allPlayerIds } = await this.updateAllScores(cleanedSubstitutions, rosterChanges, existingScoresForFallback);

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
        await this.dataLayer.saveWeeklyScores(allScores, allPlayerIds, this.playersData);
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