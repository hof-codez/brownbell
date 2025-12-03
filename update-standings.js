// update-standings.js - GitHub Actions automation script
const fs = require('fs');
const https = require('https');

class BrownBellAutomator {
    constructor(leagueId) {
        this.leagueId = leagueId;
        this.playersData = null;
        this.leagueData = null;
        this.cachedSchedule = {};

        // NFL 2025 Bye Weeks by team (CORRECT 2025 SCHEDULE)
        this.byeWeeks = {
            5: ['ATL', 'CHI', 'GB', 'PIT'],
            6: ['HOU', 'MIN'],
            7: ['BAL', 'BUF'],
            8: ['ARI', 'DET', 'JAX', 'LV', 'LAR', 'SEA'],
            9: ['CLE', 'NYJ', 'PHI', 'TB'],
            10: ['CIN', 'DAL', 'KC', 'TEN'],
            11: ['IND', 'NO'],
            12: ['DEN', 'LAC', 'MIA', 'WAS'],
            14: ['CAR', 'NE', 'NYG', 'SF']
        };

        // Exclusion list: prevent auto-substitutions for specific scenarios
        this.substitutionExclusions = [];

        // Teams that left the league - show historical data only
        this.inactiveTeams = {};  // Empty now since tigollbiddiez is being replaced

        // Manager changes - track when ownership transferred
        this.managerChanges = {
            'Dcastro90': {  // Replace with actual Sleeper username
                previousManager: 'tigollbiddiez',
                changeWeek: 6,
                reason: 'Manager Replaced'
            }
        };

        // Known duos from your tracker
        this.knownDuos = {
            main: {
                'Un14wfulBandit': [
                    { name: 'Josh Allen', position: 'QB' },
                    { name: 'Derrick Henry', position: 'RB' }
                ],
                'Chief1025': [
                    { name: 'Justin Herbert', position: 'QB' },
                    { name: 'Josh Jacobs', position: 'RB' }
                ],
                'HofDimez': [
                    { name: 'Christian McCaffrey', position: 'RB' },
                    { name: 'Justin Jefferson', position: 'WR' }
                ],
                'fsmrubix': [
                    { name: 'Jayden Daniels', position: 'QB' },
                    { name: 'CeeDee Lamb', position: 'WR' }
                ],
                'KnowItAllJankyJew': [
                    { name: 'Jordan Love', position: 'QB' },
                    { name: 'Hollywood Brown', position: 'WR' }
                ],
                'FelixR08': [
                    { name: 'Lamar Jackson', position: 'QB' },
                    { name: 'Tony Pollard', position: 'RB' }
                ],
                '713Born501Raised': [
                    { name: 'Patrick Mahomes', position: 'QB' },
                    { name: 'Josh Downs', position: 'WR' }
                ],
                'Justin274447': [
                    { name: 'Jalen Hurts', position: 'QB' },
                    { name: 'Ja\'Marr Chase', position: 'WR' }
                ],
                'Kenyatta93': [
                    { name: 'Joe Burrow', position: 'QB' },
                    { name: 'Saquon Barkley', position: 'RB' }
                ],
                'Dcastro90': [
                    { name: 'C.J. Stroud', position: 'QB' },
                    { name: 'Jahmyr Gibbs', position: 'RB' }
                ],
                'Ch3r0k33zY': [
                    { name: 'Jared Goff', position: 'QB' },
                    { name: 'Mike Evans', position: 'WR' }
                ],
                'FLYB33ZY': [
                    { name: 'Dak Prescott', position: 'QB' },
                    { name: 'Terry McLaurin', position: 'WR' }
                ]
            },
            nextup: {
                'fsmrubix': [
                    { name: 'Jaxson Dart', position: 'QB', experience: 'rookie' },
                    { name: 'Malik Nabers', position: 'WR', experience: 'second_year' }
                ],
                '713Born501Raised': [
                    { name: 'Jayden Higgins', position: 'WR', experience: 'rookie' },
                    { name: 'Bo Nix', position: 'QB', experience: 'second_year' }
                ],
                'Un14wfulBandit': [
                    { name: 'Tyler Goodson', position: 'RB', experience: 'rookie' },
                    { name: 'Bucky Irving', position: 'RB', experience: 'second_year' }
                ],
                'Ch3r0k33zY': [
                    { name: 'Braelon Allen', position: 'RB', experience: 'rookie' },
                    { name: 'Joshua Palmer', position: 'WR', experience: 'second_year' }
                ],
                'Chief1025': [
                    { name: 'Cole Kmet', position: 'TE', experience: 'rookie' },
                    { name: 'Kenneth Walker III', position: 'RB', experience: 'second_year' }
                ],
                'Justin274447': [
                    { name: 'Quentin Johnston', position: 'WR', experience: 'rookie' },
                    { name: 'Patrick Mahomes', position: 'QB', experience: 'second_year' }
                ],
                'HofDimez': [
                    { name: 'J.J. McCarthy', position: 'QB', experience: 'rookie' },
                    { name: 'Emeka Egbuka', position: 'WR', experience: 'second_year' }
                ],
                'FelixR08': [
                    { name: 'Brian Thomas Jr.', position: 'WR', experience: 'rookie' },
                    { name: 'Keon Coleman', position: 'WR', experience: 'second_year' }
                ],
                'Kenyatta93': [
                    { name: 'Jonathan Brooks', position: 'RB', experience: 'rookie' },
                    { name: 'Bryce Young', position: 'QB', experience: 'second_year' }
                ],
                'KnowItAllJankyJew': [
                    { name: 'Rome Odunze', position: 'WR', experience: 'rookie' },
                    { name: 'RJ Harvey', position: 'RB', experience: 'second_year' }
                ],
                'Dcastro90': [
                    { name: 'Caleb Williams', position: 'QB', experience: 'rookie' },
                    { name: 'George Pickens', position: 'WR', experience: 'second_year' }
                ],
                'FLYB33ZY': [
                    { name: 'Ricky Pearsall', position: 'WR', experience: 'rookie' },
                    { name: 'Zach Charbonnet', position: 'RB', experience: 'second_year' }
                ]
            }
        };

        // Manual substitution usage tracker
        this.manualSubsUsed = {};
        Object.keys(this.knownDuos.main).forEach(team => {
            this.manualSubsUsed[team] = { main: false, nextup: false };
        });
    }

    async fetchJson(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });
    }

    async loadNFLPlayers() {
        console.log('📥 Fetching NFL players data from Sleeper...');
        this.playersData = await this.fetchJson('https://api.sleeper.app/v1/players/nfl');
        console.log(`✅ Loaded ${Object.keys(this.playersData).length} NFL players`);
    }

    async loadLeagueData() {
        console.log(`📥 Fetching league data for ${this.leagueId}...`);
        const [league, rosters, users] = await Promise.all([
            this.fetchJson(`https://api.sleeper.app/v1/league/${this.leagueId}`),
            this.fetchJson(`https://api.sleeper.app/v1/league/${this.leagueId}/rosters`),
            this.fetchJson(`https://api.sleeper.app/v1/league/${this.leagueId}/users`)
        ]);

        const userMap = {};
        users.forEach(user => userMap[user.user_id] = user.display_name);

        this.leagueData = { league, rosters, users, userMap };
        console.log(`✅ Loaded league data: ${rosters.length} rosters, ${users.length} users`);
    }

    async getCurrentWeek() {
        // Get current NFL week from Sleeper's state endpoint
        const nflState = await this.fetchJson('https://api.sleeper.app/v1/state/nfl');
        return nflState.week;
    }

    async getWeeklyScores(week) {
        console.log(`📊 Fetching Week ${week} scores...`);
        const matchups = await this.fetchJson(
            `https://api.sleeper.app/v1/league/${this.leagueId}/matchups/${week}`
        );

        const scores = {};
        matchups.forEach(matchup => {
            if (matchup.players_points) {
                Object.entries(matchup.players_points).forEach(([playerId, points]) => {
                    scores[playerId] = points;
                });
            }
        });

        return scores;
    }

    findPlayerInRoster(duoPlayer, roster) {
        // Search roster for player matching duo player name
        for (const playerId of roster.players) {
            const player = this.playersData[playerId];
            if (player) {
                const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
                if (fullName === duoPlayer.name) {
                    return playerId;
                }
            }
        }
        return null;
    }

    isPlayerOnBye(playerId, week) {
        const player = this.playersData[playerId];
        if (!player || !player.team) return false;

        const byeTeams = this.byeWeeks[week] || [];
        return byeTeams.includes(player.team);
    }

    isPlayerInNextUpDuo(playerId, teamName) {
        const nextUpDuo = this.knownDuos.nextup[teamName];
        if (!nextUpDuo) return false;

        const player = this.playersData[playerId];
        if (!player) return false;

        const playerFullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();

        return nextUpDuo.some(duoPlayer => duoPlayer.name === playerFullName);
    }

    async detectInjuries(week) {
        console.log(`\n🔍 Detecting injuries for Week ${week}...`);

        const injuries = { main: {}, nextup: {} };
        const weekScores = await this.getWeeklyScores(week);

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

                        // Enhanced injury detection with more detailed logging
                        let injuryStatus = 'healthy';
                        
                        // CRITICAL FIX: More stringent injury validation
                        if (player.injury_status) {
                            const status = player.injury_status.toLowerCase();
                            
                            console.log(`⚠️ INJURY STATUS DETECTED for ${originalPlayer.name}: "${status}"`);
                            
                            // Only substitute for OUT or DOUBTFUL - not questionable
                            if (['out', 'doubtful'].includes(status)) {
                                injuryStatus = status;
                                console.log(`🚨 CONFIRMED INJURY: ${originalPlayer.name} is ${status.toUpperCase()}`);
                            }
                            // IR and PUP are season-ending
                            else if (['ir', 'pup'].includes(status)) {
                                injuryStatus = 'season_ending';
                                console.log(`🚨 SEASON-ENDING: ${originalPlayer.name} is on ${status.toUpperCase()}`);
                            }
                            else {
                                console.log(`✅ NOT SEVERE ENOUGH: ${originalPlayer.name} is ${status} - NO substitution needed`);
                            }
                        } else {
                            console.log(`✅ HEALTHY: ${originalPlayer.name} has no injury status`);
                        }

                        if (injuryStatus !== 'healthy') {
                            teamInjuries.push({
                                originalPlayer,
                                playerId,
                                index,
                                status: injuryStatus
                            });
                            console.log(`➕ Added to injury list: ${originalPlayer.name} (${injuryStatus})`);
                        }
                    }
                }

                if (teamInjuries.length > 0) {
                    injuries[awardType][teamName] = teamInjuries;
                }
            }
        }

        // Enhanced summary log
        console.log(`\n📋 INJURY DETECTION SUMMARY:`);
        const mainCount = Object.keys(injuries.main).length;
        const nextUpCount = Object.keys(injuries.nextup).length;
        console.log(`   Main Award: ${mainCount} team(s) with injuries`);
        console.log(`   Next Up Award: ${nextUpCount} team(s) with injuries`);
        
        // Detailed breakdown
        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                teamInjuries.forEach(injury => {
                    console.log(`   - ${teamName} (${awardType}): ${injury.originalPlayer.name} (${injury.status})`);
                });
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
            if (this.isPlayerOnBye(playerId, week)) {
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


    hasActiveSubstitution(teamName, playerIndex, week, awardType, existingSubstitutions) {
        return existingSubstitutions.some(sub =>
            sub.teamName === teamName &&
            sub.playerIndex === playerIndex &&
            sub.awardType === awardType &&
            sub.startWeek <= week &&
            (!sub.endWeek || sub.endWeek >= week)
        );
    }

    validateSubstitution(teamName, originalDuo, injuredIndex, substitute, awardType) {
        // Only apply position rules to Main Award
        if (awardType !== 'main') {
            return true; // Next Up Award has no position restrictions
        }

        const healthyIndex = injuredIndex === 0 ? 1 : 0;
        const healthyPlayer = originalDuo[healthyIndex];

        // Main Award restriction: Cannot have two players of the same position
        if (substitute.position === healthyPlayer.position) {
            console.log(`❌ ${substitute.name} (${substitute.position}) would duplicate ${healthyPlayer.name} (${healthyPlayer.position})`);
            return false;
        }

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

        // For Next Up Award, determine what experience level is needed
        let requiredExperience = null;
        if (awardType === 'nextup') {
            const healthyPlayerIndex = injuredPlayer.index === 0 ? 1 : 0;
            const healthyPlayer = originalDuo[healthyPlayerIndex];
            const healthyExperience = healthyPlayer.experience === 'second_year' ? 'sophomore' : healthyPlayer.experience;

            // Determine required experience to maintain rookie+sophomore rule
            if (healthyExperience === 'rookie') {
                requiredExperience = 'sophomore';
            } else if (healthyExperience === 'sophomore') {
                requiredExperience = 'rookie';
            }

            console.log(`Next Up substitution: Healthy player is ${healthyExperience}, need ${requiredExperience} substitute`);
        }

        for (const playerId of roster.players) {
            const player = this.playersData[playerId];

            // Position eligibility depends on award type
            const validPositions = awardType === 'nextup'
                ? ['QB', 'RB', 'WR', 'TE', 'K']  // Next Up: All positions
                : ['QB', 'RB', 'WR'];             // Main Award: Traditional positions only

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
            if (this.isPlayerOnBye(playerId, week)) {
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

                // Hard filter: Must be 0 or 1 years experience
                if (yearsExp > 1) {
                    continue; // Skip veterans immediately
                }

                const playerExperience = yearsExp === 0 ? 'rookie' : 'sophomore';

                // Determine required experience level
                const healthyPlayerIndex = injuredPlayer.index === 0 ? 1 : 0;
                const healthyPlayer = originalDuo[healthyPlayerIndex];
                const healthyExperience = healthyPlayer.experience === 'second_year' ? 'sophomore' : healthyPlayer.experience;

                let requiredExperience = null;
                if (healthyExperience === 'rookie') {
                    requiredExperience = 'sophomore';
                } else if (healthyExperience === 'sophomore') {
                    requiredExperience = 'rookie';
                }

                // Only include players that match the required experience level
                if (requiredExperience && playerExperience !== requiredExperience) {
                    console.log(`Skipping ${substitute.name} (${playerExperience}, ${yearsExp} years) - need ${requiredExperience} to pair with ${healthyPlayer.name}`);
                    continue;
                }

                console.log(`${substitute.name} is eligible: ${playerExperience} (${yearsExp} years) pairs with ${healthyPlayer.name} (${healthyExperience})`);

                // NEXT UP SPECIFIC POSITION RULE: No QB+QB combinations allowed
                if (substitute.position === 'QB' && healthyPlayer.position === 'QB') {
                    console.log(`Skipping ${substitute.name} (QB) - cannot have QB+QB duo in Next Up Award`);
                    continue;
                }
            }

            // Validate substitution for Main Award only
            if (awardType === 'main' && !this.validateSubstitution(teamName, originalDuo, injuredPlayer.index, substitute, awardType)) {
                continue;
            }

            // Validate substitution (for Main Award)
            if (awardType === 'main' && !this.validateSubstitution(teamName, originalDuo, injuredPlayer.index, substitute, awardType)) {
                continue;
            }

            // Calculate 3-week total score
            let totalScore = 0;
            for (let w = Math.max(1, week - 2); w <= week; w++) {
                const weekScores = await this.getWeeklyScores(w);
                if (weekScores[playerId] !== undefined) {
                    totalScore += weekScores[playerId];
                }
            }

            substitute.score = totalScore;
            eligibleSubs.push(substitute);
        }

        if (eligibleSubs.length === 0) {
            if (awardType === 'nextup') {
                const healthyPlayerIndex = injuredPlayer.index === 0 ? 1 : 0;
                const healthyPlayer = originalDuo[healthyPlayerIndex];
                const healthyExperience = healthyPlayer.experience === 'second_year' ? 'sophomore' : healthyPlayer.experience;
                const requiredExperience = healthyExperience === 'rookie' ? 'sophomore' : 'rookie';
                console.log(`❌ No suitable ${requiredExperience} substitute found for ${teamName} (Next Up Award)`);
            } else {
                console.log(`❌ No suitable substitute found for ${teamName} (Main Award)`);
            }
            return null;
        }

        // Sort by total score and use weighted random from top 4
        eligibleSubs.sort((a, b) => b.score - a.score);
        const topPerformers = eligibleSubs.slice(0, Math.min(4, eligibleSubs.length)); // Changed from 5 to 4

        console.log(`\n🎯 Top ${topPerformers.length} eligible substitutes:`);
        topPerformers.forEach((sub, idx) => {
            console.log(`   ${idx + 1}. ${sub.name} (${sub.position}) - ${sub.score.toFixed(1)} pts`);
        });

        // Weighted random selection (40%, 30%, 20%, 10%)
        const weights = [0.40, 0.30, 0.20, 0.10]; 
        const random = Math.random();
        let cumulativeWeight = 0;
        let selectedIndex = 0;

        for (let i = 0; i < Math.min(topPerformers.length, 4); i++) {
            cumulativeWeight += weights[i];
            if (random <= cumulativeWeight) {
                selectedIndex = i;
                break;
            }
        }

        const selectedSub = topPerformers[selectedIndex];

        const experienceNote = awardType === 'nextup' ? ` (${selectedSub.yearsExp <= 0 ? 'rookie' : 'sophomore'})` : '';
        console.log(`\n✅ Selected substitute: ${selectedSub.name} (${selectedSub.position})${experienceNote} - Rank #${selectedIndex + 1} with ${selectedSub.score.toFixed(1)} pts (weight: ${(weights[selectedIndex] * 100).toFixed(0)}%)`);

        return selectedSub;
    }

    async cleanupExpiredSubstitutions(week, existingSubstitutions) {
        console.log(`\n🧹 Cleaning up expired substitutions for Week ${week}...`);

        const weekScores = await this.getWeeklyScores(week);
        let cleanedCount = 0;

        for (const sub of existingSubstitutions) {
            // Skip indefinite substitutions (Next Up Award or season-ending injuries)
            if (!sub.endWeek) continue;

            // Skip if already deactivated
            if (!sub.active) continue;

            // If this is past the end week, deactivate it
            if (week > sub.endWeek) {
                sub.active = false;
                cleanedCount++;
                console.log(`Deactivated: ${sub.teamName} - ${sub.substituteName} for ${sub.originalName} (Week ${sub.startWeek}-${sub.endWeek})`);
            }
        }

        console.log(`✅ Cleaned up ${cleanedCount} expired substitutions`);
        return cleanedCount;
    }

    async replaceInjuredSubstitutes(week, injuredSubs, existingSubstitutions) {
        console.log(`\n🔄 Finding replacements for ${injuredSubs.length} injured/dropped substitutes...`);

        const newSubstitutions = [];

        for (const injuredSub of injuredSubs) {
            // Get the original injured player details
            const originalDuo = this.knownDuos[injuredSub.awardType][injuredSub.teamName];
            const originalPlayer = originalDuo[injuredSub.playerIndex];

            console.log(`\n🔎 Replacing ${injuredSub.substituteName} for ${injuredSub.teamName} (${injuredSub.awardType})`);

            // Create injury object for the original player
            const originalInjury = {
                originalPlayer: originalPlayer,
                playerId: this.findPlayerInRoster(
                    originalPlayer,
                    this.leagueData.rosters.find(r =>
                        this.leagueData.userMap[r.owner_id] === injuredSub.teamName
                    )
                ),
                index: injuredSub.playerIndex,
                status: injuredSub.reason.includes('season_ending') ? 'season_ending' : 'out'
            };

            const newSubstitute = await this.findSubstitute(
                injuredSub.teamName,
                originalInjury,
                week,
                injuredSub.awardType
            );

            if (newSubstitute) {
                // Deactivate old substitution
                injuredSub.active = false;
                injuredSub.endWeek = week - 1;

                // Create new substitution
                newSubstitutions.push({
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
                    reason: `Replaced injured substitute (${injuredSub.substituteName})`
                });

                console.log(`✅ New substitute: ${newSubstitute.name} for ${injuredSub.originalName}`);
            } else {
                console.log(`❌ No suitable replacement found for ${injuredSub.originalName}`);

                // Mark as "no replacement available"
                newSubstitutions.push({
                    teamName: injuredSub.teamName,
                    playerIndex: injuredSub.playerIndex,
                    awardType: injuredSub.awardType,
                    originalName: injuredSub.originalName,
                    originalPosition: injuredSub.originalPosition,
                    substituteName: null,
                    substitutePlayerId: null,
                    substitutePosition: null,
                    startWeek: week,
                    endWeek: injuredSub.awardType === 'main' ? week : null,
                    active: true,
                    autoGenerated: true,
                    reason: 'No eligible replacement available'
                });
            }
        }

        return newSubstitutions;
    }

    async generateSubstitutions(checkpointType) {
        console.log(`\n🏥 Checking for injuries (Checkpoint: ${checkpointType})...`);

        const currentWeek = await this.getCurrentWeek();
        const injuries = await this.detectInjuries(currentWeek);
        const newSubstitutions = [];

        // Load existing substitutions to avoid duplicates
        let existingSubstitutions = [];
        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                const existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
                existingSubstitutions = existingData.substitutions || [];
            }
        } catch (error) {
            console.log('No existing substitutions found');
        }

        console.log('📋 Processing detected injuries...');

        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                for (const injury of teamInjuries) {
                    console.log(`\n🔍 Processing injury: ${teamName} - ${injury.originalPlayer.name} (${injury.status})`);

                    // Check if we already have an active substitution for this week
                    const hasActiveSub = this.hasActiveSubstitution(
                        teamName, injury.index, currentWeek, awardType, existingSubstitutions
                    );

                    if (hasActiveSub) {
                        console.log(`⏭️ Already has active substitution for ${teamName} ${awardType} position ${injury.index}`);
                        continue;
                    }

                    if (['out', 'doubtful', 'season_ending'].includes(injury.status)) {
                        console.log(`🔎 Calling findSubstitute for ${teamName}...`);
                        const substitute = await this.findSubstitute(teamName, injury, currentWeek, awardType);

                        if (substitute) {
                            const subEntry = {
                                teamName,
                                playerIndex: injury.index,
                                awardType,
                                originalName: injury.originalPlayer.name,
                                originalPosition: injury.originalPlayer.position,
                                substituteName: substitute.name,
                                substitutePlayerId: substitute.id,
                                substitutePosition: substitute.position,
                                startWeek: currentWeek,
                                endWeek: awardType === 'main' ? currentWeek : null, // Main Award = single week, Next Up = indefinite
                                active: true,
                                autoGenerated: true,
                                reason: `Injury Checkpoint (3) - ${injury.status}`
                            };

                            newSubstitutions.push(subEntry);

                            console.log(`✅ Generated substitution:`);
                            console.log(`   Team: ${teamName} (${awardType})`);
                            console.log(`   Original: ${injury.originalPlayer.name} (${injury.originalPlayer.position})`);
                            console.log(`   Substitute: ${substitute.name} (${substitute.position})`);
                            console.log(`   Duration: Week ${currentWeek}${awardType === 'nextup' ? '+' : ''}`);
                        } else {
                            console.log(`❌ No suitable substitute found for ${injury.originalPlayer.name}`);
                        }
                    }
                }
            }
        }

        // Summary
        if (newSubstitutions.length > 0) {
            const mainCount = newSubstitutions.filter(s => s.awardType === 'main').length;
            const nextUpCount = newSubstitutions.filter(s => s.awardType === 'nextup').length;
            console.log(`\n📊 Generated ${newSubstitutions.length} new substitutions:`);
            console.log(`   Main Award: ${mainCount}`);
            console.log(`   Next Up Award: ${nextUpCount}`);
        } else {
            console.log('\n✅ No new substitutions needed');
        }

        return newSubstitutions;
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
            // Fetch the official NFL schedule page
            const url = 'https://operations.nfl.com/gameday/nfl-schedule/2025-nfl-schedule/';
            const html = await this.fetchHtml(url);

            // Parse the schedule for the specific week
            const weekSchedule = this.parseNFLSchedule(html, week);

            // Cache it for this week
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

        // Parse BYE weeks
        const byeTeams = this.byeWeeks[targetWeek] || [];
        byeTeams.forEach(team => {
            schedule[team] = {
                opponent: 'BYE',
                date: null,
                location: null
            };
        });

        // Extract games from HTML
        const weekRegex = new RegExp(`<h2[^>]*>Week ${targetWeek}</h2>([\\s\\S]*?)(?=<h2|$)`, 'i');
        const weekMatch = html.match(weekRegex);

        if (!weekMatch) {
            console.log(`Could not find Week ${targetWeek} in schedule HTML`);
            return schedule;
        }

        const weekContent = weekMatch[1];

        // Parse individual games
        const gameRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let gameMatch;

        while ((gameMatch = gameRegex.exec(weekContent)) !== null) {
            const gameRow = gameMatch[1];

            // Extract team names
            const teamMatches = gameRow.match(/<td[^>]*>(.*?)<\/td>/g);
            if (!teamMatches || teamMatches.length < 4) continue;

            // Extract date/time
            const dateMatch = gameRow.match(/<td[^>]*>(.*?)<\/td>/);
            if (!dateMatch) continue;

            const dateText = dateMatch[1].replace(/<[^>]+>/g, '').trim();
            
            // Parse date
            const gameDate = this.parseGameDateTime(dateText, targetWeek);

            // Extract teams (usually in columns 2 and 3)
            let awayTeam = null;
            let homeTeam = null;

            for (const teamCell of teamMatches) {
                const teamText = teamCell.replace(/<[^>]+>/g, '').trim();
                for (const [fullName, abbr] of Object.entries(teamAbbreviations)) {
                    if (teamText.includes(fullName)) {
                        if (!awayTeam) {
                            awayTeam = abbr;
                        } else if (!homeTeam) {
                            homeTeam = abbr;
                            break;
                        }
                    }
                }
            }

            if (awayTeam && homeTeam && gameDate) {
                schedule[awayTeam] = {
                    opponent: homeTeam,
                    date: gameDate,
                    location: 'Away'
                };
                schedule[homeTeam] = {
                    opponent: awayTeam,
                    date: gameDate,
                    location: 'Home'
                };
            }
        }

        return schedule;
    }

    parseGameDateTime(dateString, week) {
        try {
            // Example formats from NFL.com:
            // "Sunday, September 8, 1:00 PM ET"
            // "Thursday, September 5, 8:20 PM ET"

            // Current year (assuming 2024 season = 2024-2025)
            const year = week <= 17 ? 2024 : 2025;

            // Parse date components
            const dateMatch = dateString.match(/(\w+),\s*(\w+)\s*(\d+),\s*(\d+):(\d+)\s*(AM|PM)\s*(\w+)/i);
            if (!dateMatch) return null;

            const [, , monthName, day, hour, minute, ampm, timezone] = dateMatch;

            // Month mapping
            const months = {
                'january': 0, 'february': 1, 'march': 2, 'april': 3,
                'may': 4, 'june': 5, 'july': 6, 'august': 7,
                'september': 8, 'october': 9, 'november': 10, 'december': 11
            };

            const month = months[monthName.toLowerCase()];
            let hours = parseInt(hour);
            if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

            // Create date in Eastern Time
            const gameDate = new Date(year, month, parseInt(day), hours, parseInt(minute));

            // Convert to UTC (ET is UTC-5 or UTC-4 depending on DST)
            const isDST = this.isDST(gameDate);
            const offset = isDST ? 4 : 5;
            const utcDate = new Date(gameDate.getTime() + (offset * 60 * 60 * 1000));

            return utcDate;

        } catch (error) {
            console.error(`Error parsing date: ${error.message}`);
            return null;
        }
    }

    isDST(date) {
        // Daylight Saving Time in the US runs from second Sunday in March to first Sunday in November
        const year = date.getFullYear();
        const march = new Date(year, 2, 1);
        const november = new Date(year, 10, 1);

        // Find second Sunday in March
        const marchSecondSunday = new Date(year, 2, 8 + (7 - new Date(year, 2, 8).getDay()) % 7);
        // Find first Sunday in November
        const novemberFirstSunday = new Date(year, 10, 1 + (7 - new Date(year, 10, 1).getDay()) % 7);

        return date >= marchSecondSunday && date < novemberFirstSunday;
    }

    convertToUTC(dateString, timezone) {
        try {
            // Simple timezone offset mapping
            const offsets = {
                'ET': -5, 'EST': -5, 'EDT': -4,
                'CT': -6, 'CST': -6, 'CDT': -5,
                'MT': -7, 'MST': -7, 'MDT': -6,
                'PT': -8, 'PST': -8, 'PDT': -7
            };

            const offset = offsets[timezone.toUpperCase()] || -5; // Default to ET

            // Parse the date
            const localDate = new Date(dateString);
            const utcDate = new Date(localDate.getTime() - (offset * 60 * 60 * 1000));

            return utcDate;

        } catch (error) {
            console.error(`Error converting time: ${error.message}`);
            return null;
        }
    }

    async checkGameTimeInjuries() {
        console.log('Checking for last-minute injury updates...');

        // Get current time info
        const now = new Date();
        const currentWeek = await this.getCurrentWeek();

        // For now, we'll do a general pre-game check
        // Future enhancement: integrate with NFL schedule API for specific game times

        const injuries = await this.detectInjuries(currentWeek);
        const newSubstitutions = [];

        // Load existing substitutions
        let existingSubstitutions = [];
        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                const existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
                existingSubstitutions = existingData.substitutions || [];
            }
        } catch (error) {
            console.log('No existing substitutions found');
        }

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

    async checkInternationalGameInjuries() {
        console.log('Checking for international game injury updates...');

        const now = new Date();
        const currentWeek = await this.getCurrentWeek();

        // International game weeks for 2025 (you'll need to update these annually)
        const internationalWeeks = {
            1: ['Chiefs', 'Chargers'], // Brazil - Friday night
            4: ['Steelers', 'Vikings'], // Dublin - Sunday 9:30 AM ET
            5: ['Vikings', 'Browns'], // London - Sunday 9:30 AM ET  
            6: ['Broncos', 'Jets'], // London - Sunday 9:30 AM ET
            7: ['Rams', 'Jaguars'], // London - Sunday 9:30 AM ET
            10: ['Falcons', 'Colts'], // Berlin - Sunday 9:30 AM ET
            11: ['Dolphins', 'Commanders'] // Madrid - Sunday 9:30 AM ET
        };

        // Check if current week has international games
        const teamsInInternationalGames = internationalWeeks[currentWeek] || [];

        if (teamsInInternationalGames.length === 0) {
            console.log(`No international games in Week ${currentWeek}`);
            return [];
        }

        console.log(`International games this week: ${teamsInInternationalGames.join(' vs ')}`);

        // Enhanced injury detection for international game teams
        const injuries = await this.detectInjuries(currentWeek);
        const newSubstitutions = [];

        // Load existing substitutions
        let existingSubstitutions = [];
        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                const existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
                existingSubstitutions = existingData.substitutions || [];
            }
        } catch (error) {
            console.log('No existing substitutions found');
        }

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

    async calculateScores(week) {
        console.log(`\n📊 Calculating scores for Week ${week}...`);

        const weekScores = await this.getWeeklyScores(week);

        // Load existing data
        let existingData = null;
        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
            }
        } catch (error) {
            console.log('No existing data found, starting fresh');
        }

        const existingSubstitutions = existingData?.substitutions || [];

        const results = { main: [], nextup: [] };

        for (const awardType of ['main', 'nextup']) {
            const duos = this.knownDuos[awardType];

            for (const [teamName, originalDuo] of Object.entries(duos)) {
                const roster = this.leagueData.rosters.find(r =>
                    this.leagueData.userMap[r.owner_id] === teamName
                );

                if (!roster) continue;

                const teamResult = {
                    name: teamName,
                    players: [],
                    totalScore: 0
                };

                for (let index = 0; index < originalDuo.length; index++) {
                    const originalPlayer = originalDuo[index];

                    // Check for active substitution
                    const activeSub = existingSubstitutions.find(sub =>
                        sub.teamName === teamName &&
                        sub.playerIndex === index &&
                        sub.awardType === awardType &&
                        sub.active &&
                        sub.startWeek <= week &&
                        (!sub.endWeek || sub.endWeek >= week)
                    );

                    let playerId;
                    let playerName;
                    let playerPosition;
                    let isSubstitute = false;

                    if (activeSub && activeSub.substituteName) {
                        playerId = activeSub.substitutePlayerId;
                        playerName = activeSub.substituteName;
                        playerPosition = activeSub.substitutePosition;
                        isSubstitute = true;
                    } else {
                        playerId = this.findPlayerInRoster(originalPlayer, roster);
                        playerName = originalPlayer.name;
                        playerPosition = originalPlayer.position;
                    }

                    const score = playerId ? (weekScores[playerId] || 0) : 0;

                    teamResult.players.push({
                        name: playerName,
                        position: playerPosition,
                        score: score,
                        sleeperId: playerId,
                        isSubstitute: isSubstitute,
                        substituteFor: isSubstitute ? originalPlayer.name : null
                    });

                    teamResult.totalScore += score;
                }

                results[awardType].push(teamResult);
            }

            // Sort by total score
            results[awardType].sort((a, b) => b.totalScore - a.totalScore);
        }

        return results;
    }

    async exportData() {
        console.log('\n📤 Exporting data to brown-bell-data.json...');

        const currentWeek = await this.getCurrentWeek();

        // Load existing data to preserve substitutions
        let existingData = null;
        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
            }
        } catch (error) {
            console.log('No existing data found, starting fresh');
        }

        // Preserve existing substitutions and roster changes
        const substitutions = existingData?.substitutions || [];
        const rosterChanges = existingData?.rosterChanges || [];

        // Calculate scores for current week
        const scores = await this.calculateScores(currentWeek);

        // Create data structure with proper IDs
        const data = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            currentWeek,
            currentAward: 'main',
            teams: [],
            nextUpTeams: [],
            weeklyScores: scores,
            substitutions: substitutions,
            rosterChanges: rosterChanges,
            manualSubsUsed: existingData?.manualSubsUsed || this.manualSubsUsed,
            inactiveTeams: this.inactiveTeams,
            managerChanges: this.managerChanges,
            sleeperLeagueId: this.leagueId,
            lastAutomationRun: new Date().toISOString(),
            lastCheckpointType: existingData?.lastCheckpointType || 'MANUAL',
            automationStats: existingData?.automationStats || {
                scoresUpdated: 0,
                newSubstitutions: 0,
                totalSubstitutions: substitutions.length,
                cleanedSubstitutions: 0
            }
        };

        // Add teams with Sleeper IDs
        for (const awardType of ['main', 'nextup']) {
            const duos = this.knownDuos[awardType];
            const targetArray = awardType === 'main' ? data.teams : data.nextUpTeams;

            for (const [teamName, originalDuo] of Object.entries(duos)) {
                const roster = this.leagueData.rosters.find(r =>
                    this.leagueData.userMap[r.owner_id] === teamName
                );

                const teamData = {
                    name: teamName,
                    players: originalDuo.map(player => ({
                        name: player.name,
                        position: player.position,
                        sleeperId: roster ? this.findPlayerInRoster(player, roster) : null,
                        ...(awardType === 'nextup' && { experience: player.experience })
                    })),
                    sleeper_roster_id: roster ? roster.roster_id : null
                };

                targetArray.push(teamData);
            }
        }

        fs.writeFileSync('brown-bell-data.json', JSON.stringify(data, null, 2));
        console.log('✅ Data exported successfully');

        return data;
    }

    async runAutomation() {
        console.log('\n🤖 BROWN BELL AWARD AUTOMATION');
        console.log('======================================\n');

        try {
            // Load data
            await this.loadNFLPlayers();
            await this.loadLeagueData();

            const currentWeek = await this.getCurrentWeek();
            console.log(`\n📅 Current NFL Week: ${currentWeek}`);

            // AUTOMATION SCHEDULE LOGIC
            const now = new Date();
            const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const currentHour = now.getHours(); // 0-23

            let checkpointType = 'ROUTINE_UPDATE';
            let shouldRunSubstitutions = false;

            // MANUAL OVERRIDE: Allow force-run via environment variable
            if (process.env.FORCE_SUBSTITUTIONS === 'true') {
                checkpointType = 'MANUAL_TRIGGER';
                shouldRunSubstitutions = true;
            }
            // Tuesday: Post-Monday Night Football check
            else if (currentDay === 2) {
                checkpointType = 'TUESDAY_CHECK';
                shouldRunSubstitutions = true;
            }
            // Thursday: Pre-Thursday Night Football check
            else if (currentDay === 4) {
                checkpointType = 'THURSDAY_CHECK';
                shouldRunSubstitutions = true;
            }
            // Saturday: International/early game prep (7 AM+)
            else if (currentDay === 6 && currentHour >= 7) {
                checkpointType = 'SATURDAY_CHECK';
                shouldRunSubstitutions = true;
            }
            // Sunday: International/early game check (7-11 AM)
            else if (currentDay === 0 && currentHour >= 7 && currentHour < 11) {
                checkpointType = 'SUNDAY_INTERNATIONAL_CHECK';
                shouldRunSubstitutions = true;
            }
            // Sunday: Pre-game injury check (11 AM+)
            else if (currentDay === 0 && currentHour >= 11) {
                checkpointType = 'SUNDAY_PREGAME_CHECK';
                shouldRunSubstitutions = true;
            }

            console.log(`\n⏰ Current time: ${now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', timeZoneName: 'short' })}`);
            console.log(`📍 Checkpoint type: ${checkpointType}`);

            // Load existing data to get substitutions
            let existingData = null;
            try {
                if (require('fs').existsSync('brown-bell-data.json')) {
                    existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
                }
            } catch (error) {
                console.log('No existing data found, starting fresh');
            }

            const existingSubstitutions = existingData?.substitutions || [];
            let newSubstitutions = [];
            let cleanedCount = 0;

            // RUN SUBSTITUTION LOGIC (if applicable)
            if (shouldRunSubstitutions) {
                console.log(`\n🏥 SUBSTITUTION CHECKPOINT: ${checkpointType}`);

                // Step 1: Clean up expired substitutions
                cleanedCount = await this.cleanupExpiredSubstitutions(currentWeek, existingSubstitutions);

                // Step 2: Check if active substitutes are injured/dropped
                const injuredSubs = await this.detectSubstituteInjuries(currentWeek, existingSubstitutions);

                // Step 3: Replace injured substitutes
                if (injuredSubs.length > 0) {
                    const replacements = await this.replaceInjuredSubstitutes(currentWeek, injuredSubs, existingSubstitutions);
                    newSubstitutions.push(...replacements);
                }

                // Step 4: Check for new injuries and generate substitutions
                const injuries = await this.detectInjuries(currentWeek);

                for (const awardType of ['main', 'nextup']) {
                    for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                        for (const injury of teamInjuries) {
                            // Check if we already have an active substitution
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
                                        reason: `Injury Checkpoint (${checkpointType.includes('INTERNATIONAL') ? '1' : checkpointType.includes('PREGAME') ? '2' : '3'}) - ${injury.status}`
                                    });
                                }
                            }
                        }
                    }
                }

                // Add new substitutions to existing list
                if (newSubstitutions.length > 0) {
                    existingSubstitutions.push(...newSubstitutions);
                }

                // Update automation stats
                if (existingData) {
                    existingData.lastCheckpointType = checkpointType;
                    existingData.automationStats = {
                        scoresUpdated: currentWeek,
                        newSubstitutions: newSubstitutions.length,
                        totalSubstitutions: existingSubstitutions.length,
                        cleanedSubstitutions: cleanedCount
                    };
                    existingData.substitutions = existingSubstitutions;
                }
            } else {
                console.log('\n📊 SCORES UPDATE ONLY (No substitution checkpoint)');
            }

            // ALWAYS update scores regardless of checkpoint
            await this.exportData();

            // Summary
            console.log('\n✅ AUTOMATION COMPLETE');
            if (shouldRunSubstitutions) {
                console.log(`   New substitutions: ${newSubstitutions.length}`);
                console.log(`   Cleaned expired: ${cleanedCount}`);
            }
            console.log(`   Scores updated for Week ${currentWeek}`);

        } catch (error) {
            console.error('❌ Automation error:', error.message);
            throw error;
        }
    }
}

// Run automation
const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || '1180184775406903296';
const automator = new BrownBellAutomator(LEAGUE_ID);
automator.runAutomation().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});