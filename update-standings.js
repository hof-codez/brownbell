// update-standings.js - GitHub Actions automation script
const fs = require('fs');
const https = require('https');

class BrownBellAutomator {
    constructor(leagueId) {
        this.leagueId = leagueId;
        this.playersData = null;
        this.leagueData = null;

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
        this.inactiveTeams = {
            'tigollbiddiez': {
                lastActiveWeek: 5,
                reason: 'Left League'
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
                'tigollbiddiez': [
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
                'Ch3r0k33zY': [
                    { name: 'Tetairoa McMillan', position: 'WR', experience: 'rookie' },
                    { name: 'Bucky Irving', position: 'RB', experience: 'second_year' }
                ],
                'KnowItAllJankyJew': [
                    { name: 'Quinshon Judkins', position: 'RB', experience: 'rookie' },
                    { name: 'Jalen Coker', position: 'WR', experience: 'second_year' }
                ],
                'HofDimez': [
                    { name: 'Emeka Egbuka', position: 'WR', experience: 'rookie' },
                    { name: 'J.J. McCarthy', position: 'QB', experience: 'second_year' }
                ],
                'Un14wfulBandit': [
                    { name: 'Ashton Jeanty', position: 'RB', experience: 'rookie' },
                    { name: 'Brian Thomas', position: 'WR', experience: 'second_year' }
                ],
                'Kenyatta93': [
                    { name: 'Kaleb Johnson', position: 'RB', experience: 'rookie' },
                    { name: 'DeVaughn Vele', position: 'WR', experience: 'second_year' }
                ],
                'FelixR08': [
                    { name: 'Elic Ayomanor', position: 'WR', experience: 'rookie' },
                    { name: 'Rome Odunze', position: 'WR', experience: 'second_year' }
                ],
                'FLYB33ZY': [
                    { name: 'Tory Horton', position: 'WR', experience: 'rookie' },
                    { name: 'Trey Benson', position: 'RB', experience: 'second_year' }
                ]
            }
        };
    }

    async fetchJson(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
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
        // NFL 2025 season starts Thursday, September 4, 2025
        const seasonStart = new Date('2025-09-04T00:00:00Z'); // Thursday of Week 1
        const now = new Date();

        // Calculate days since season start
        const daysSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000));

        // Each NFL week starts on Thursday and runs 7 days
        // Week transitions happen every Thursday
        let calculatedWeek = Math.floor(daysSinceStart / 7) + 1;

        // Cap between 1 and 18 (NFL regular season)
        calculatedWeek = Math.max(1, Math.min(18, calculatedWeek));

        // Use Sleeper's league.leg if available and reasonable, otherwise use calculation
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

    findPlayerInRoster(originalPlayer, roster) {
        if (!roster.players) return null;

        return roster.players.find(playerId => {
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

                originalDuo.forEach((originalPlayer, index) => {
                    const playerId = this.findPlayerInRoster(originalPlayer, roster);

                    if (playerId) {
                        const player = this.playersData[playerId];
                        const playerScore = weekScores[playerId] || 0;

                        console.log(`📊 ${originalPlayer.name} (${teamName}): Score=${playerScore}, Status=${player.injury_status || 'none'}`);

                        // CRITICAL RULE: If player has scored points this week, they started and cannot be substituted
                        if (playerScore > 0) {
                            console.log(`✅ ${originalPlayer.name} scored ${playerScore} points - CANNOT substitute (started the game)`);
                            return;
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
                });

                if (teamInjuries.length > 0) {
                    injuries[awardType][teamName] = teamInjuries;
                }
            }
        }

        return injuries;
    }

    async detectSubstituteInjuries(week, existingSubstitutions) {
        console.log('🔍 Checking if active substitutes are injured...');

        const weekScores = await this.getWeeklyScores(week);
        const injuredSubs = [];

        for (const sub of existingSubstitutions) {
            // Only check substitutions active for this week
            if (sub.startWeek > week || (sub.endWeek && sub.endWeek < week)) {
                continue;
            }

            const playerId = sub.substitutePlayerId;
            const player = this.playersData[playerId];

            if (!player) continue;

            const playerScore = weekScores[playerId] || 0;

            // If substitute scored points, they played and are fine
            if (playerScore > 0) {
                console.log(`✅ Substitute ${sub.substituteName} scored ${playerScore} points - healthy`);
                continue;
            }

            // Check injury status
            let isInjured = false;
            if (player.injury_status) {
                const status = player.injury_status.toLowerCase();
                if (['out', 'doubtful', 'ir', 'pup'].includes(status)) {
                    isInjured = true;
                    console.log(`🚨 SUBSTITUTE INJURED: ${sub.substituteName} (${status}) for ${sub.teamName}`);
                }
            }

            // Check if on bye
            if (this.isPlayerOnBye(playerId, week)) {
                isInjured = true;
                console.log(`🚨 SUBSTITUTE ON BYE: ${sub.substituteName} for ${sub.teamName}`);
            }

            if (isInjured) {
                injuredSubs.push(sub);
            }
        }

        return injuredSubs;
    }


    async runAutomationCheckpoint(checkpointType) {
        console.log(`Running ${checkpointType} injury checkpoint...`);

        const currentWeek = await this.getCurrentWeek();
        let existingData = { substitutions: [] };

        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
            }
        } catch (error) {
            console.log('No existing data found');
        }

        const cleanedSubstitutions = this.cleanupSubstitutions(existingData.substitutions, currentWeek);
        const newSubstitutions = await this.generateWeeklySubstitutions(currentWeek, cleanedSubstitutions);

        if (newSubstitutions.length > 0) {
            console.log(`${checkpointType}: Generated ${newSubstitutions.length} new substitutions`);

            // Update the data file with new substitutions
            const updatedData = await this.generateCompleteData();
            require('fs').writeFileSync('brown-bell-data.json', JSON.stringify(updatedData, null, 2));

            return newSubstitutions;
        } else {
            console.log(`${checkpointType}: No new substitutions needed`);
            return [];
        }
    }

    validateDuoCombination(healthyPlayerPosition, substitutePosition) {
        const validCombos = ['QB+RB', 'QB+WR', 'RB+WR'];
        const newCombo = [healthyPlayerPosition, substitutePosition].sort().join('+');
        const isValid = validCombos.includes(newCombo);

        if (!isValid) {
            console.warn(`Invalid duo combination: ${healthyPlayerPosition} + ${substitutePosition}`);
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
            Valid combos: QB+RB, QB+WR, RB+WR`);
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

            // DEBUG: Log every player being considered
            if (player && ['QB', 'RB', 'WR'].includes(player.position)) {
                console.log(`Evaluating: ${player.first_name} ${player.last_name} (${playerId})`);
            }

            if (!player || !['QB', 'RB', 'WR'].includes(player.position)) continue;

            // Skip if this is the injured player
            if (playerId === injuredPlayer.playerId) continue;

            // Skip if this player is in the Next Up duo (for Main Award)
            if (awardType === 'main' && this.isPlayerInNextUpDuo(playerId, teamName)) {
                console.log(`Skipping ${player.first_name} ${player.last_name} - reserved for Next Up Award`);
                continue;
            }

            // Skip if injured
            if (player.injury_status && ['out', 'doubtful', 'ir'].includes(player.injury_status.toLowerCase())) {
                continue;
            }

            // Skip if substitute is on bye this week
            if (this.isPlayerOnBye(playerId, week)) {
                console.log(`Skipping ${player.first_name} ${player.last_name} - on bye week ${week}`);
                continue;
            }

            // CORRECTED: Check if THIS CANDIDATE (not the injured player) already played
            const currentWeekScores = await this.getWeeklyScores(week);
            const candidateScore = currentWeekScores[playerId] || 0;

            // Only skip if player has scored points (game has started)
            // 0 points before game time means they haven't played yet
            if (candidateScore > 0) {
                console.log(`Skipping ${player.first_name} ${player.last_name} - already played this week (${candidateScore} pts)`);
                continue;
            }

            const substitute = {
                id: playerId,
                name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
                position: player.position,
                yearsExp: player.years_exp || 0
            };

            // Next Up Award smart eligibility
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

                // ADD THIS NEW SECTION HERE
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
                const needed = healthyExperience === 'rookie' ? 'sophomore' : 'rookie';
                console.log(`❌ NO ELIGIBLE SUBSTITUTES: Need ${needed} player to pair with ${healthyPlayer.name} (${healthyExperience}). No valid candidates available on roster.`);
            }
            return null;
        }

        // Sort by total score and randomly select from top 5
        eligibleSubs.sort((a, b) => b.score - a.score);
        const topPerformers = eligibleSubs.slice(0, Math.min(5, eligibleSubs.length));
        const randomIndex = Math.floor(Math.random() * topPerformers.length);
        const selectedSub = topPerformers[randomIndex];

        const experienceNote = awardType === 'nextup' ? ` (${selectedSub.yearsExp <= 0 ? 'rookie' : 'sophomore'})` : '';
        console.log(`Selected ${selectedSub.name}${experienceNote} (${selectedSub.score.toFixed(1)} pts over 3 weeks) from top ${topPerformers.length} available for ${teamName}`);

        return selectedSub;
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

    async generateWeeklySubstitutions(week, existingSubstitutions) {
        console.log(`🔄 Generating weekly substitutions for week ${week}...`);

        // NEW: Check if any existing substitutes are now injured
        const injuredSubs = await this.detectSubstituteInjuries(week, existingSubstitutions);

        // Remove injured substitutes from existingSubstitutions
        if (injuredSubs.length > 0) {
            console.log(`⚠️ Found ${injuredSubs.length} injured substitutes - will replace them`);
            existingSubstitutions = existingSubstitutions.filter(sub =>
                !injuredSubs.some(injured =>
                    injured.teamName === sub.teamName &&
                    injured.playerIndex === sub.playerIndex &&
                    injured.awardType === sub.awardType &&
                    injured.startWeek === sub.startWeek
                )
            );
        }

        const injuries = await this.detectInjuries(week);
        const weeklySubstitutions = [];

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

                    // Check if injured player is on bye week
                    if (this.isPlayerOnBye(injury.playerId, week)) {
                        console.log(`🚫 Substitution blocked: ${injury.originalPlayer.name} is on bye week ${week} - no advantage given`);
                        continue;
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
                            endWeek: awardType === 'main' ? week : null,
                            active: true,
                            autoGenerated: true,
                            reason: reason
                        });

                        console.log(`✅ New auto-sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name} (Week ${week})`);
                    } else {
                        console.log(`❌ No suitable substitute found: ${teamName} ${awardType} for ${injury.originalPlayer.name}`);
                    }
                }
            }
        }

        return weeklySubstitutions;
    }

    cleanupSubstitutions(substitutions, currentWeek) {
        // Remove invalid substitutions and resolve conflicts
        const validSubstitutions = substitutions.filter(sub => {
            // Fix invalid date ranges
            if (sub.endWeek && sub.endWeek < sub.startWeek) {
                sub.endWeek = null;
            }

            // Remove future substitutions
            if (sub.startWeek > currentWeek) {
                return false;
            }

            return true;
        });

        // Group overlapping substitutions and keep the most recent
        const grouped = {};
        validSubstitutions.forEach(sub => {
            const key = `${sub.teamName}_${sub.playerIndex}_${sub.awardType}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(sub);
        });

        const cleaned = [];
        Object.values(grouped).forEach(group => {
            // Sort by start week descending
            group.sort((a, b) => b.startWeek - a.startWeek);

            // For each week, only keep one active substitution
            const weeklyActive = {};
            group.forEach(sub => {
                for (let week = sub.startWeek; week <= (sub.endWeek || currentWeek); week++) {
                    if (!weeklyActive[week] || weeklyActive[week].startWeek < sub.startWeek) {
                        weeklyActive[week] = sub;
                    }
                }
            });

            // Add unique substitutions
            const unique = [...new Set(Object.values(weeklyActive))];
            cleaned.push(...unique);
        });

        return cleaned;
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

    isPlayerOnBye(playerId, week) {
        const player = this.playersData[playerId];
        if (!player || !player.team) return false;

        const teamByeWeek = Object.entries(this.byeWeeks).find(([byeWeek, teams]) =>
            teams.includes(player.team) && parseInt(byeWeek) === week
        );

        if (teamByeWeek) {
            console.log(`${player.first_name} ${player.last_name} (${player.team}) is on bye week ${week}`);
        }

        return !!teamByeWeek;
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

    async updateAllScores() {
        console.log('Updating all weekly scores...');

        const currentWeek = await this.getCurrentWeek();
        const scores = { main: {}, nextup: {} };

        // Load existing data and substitutions
        let existingSubstitutions = [];
        let existingData = { scores: {}, nextUpScores: {}, substitutions: [] };  // ADD THIS LINE
        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));  // MODIFIED
                existingSubstitutions = existingData.substitutions || [];
            }
        } catch (error) {
            console.log('No existing substitutions found');
        }

        // Process each award type
        for (const awardType of ['main', 'nextup']) {
            const duos = this.knownDuos[awardType];

            for (const [teamName, originalDuo] of Object.entries(duos)) {
                scores[awardType][teamName] = {};

                const roster = this.leagueData.rosters.find(r =>
                    this.leagueData.userMap[r.owner_id] === teamName
                );

                // ADD THIS ENTIRE SECTION - CHECK FOR INACTIVE TEAMS
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
                // END OF ADDED SECTION

                // Get scores for each week up to current OR last active week
                for (let week = 1; week <= Math.min(currentWeek, teamLastWeek); week++) {  // MODIFIED THIS LINE
                    const weekScores = await this.getWeeklyScores(week);
                    scores[awardType][teamName][week] = {};

                    originalDuo.forEach((originalPlayer, index) => {
                        // Check for active substitution in this week
                        const activeSub = existingSubstitutions.find(sub =>
                            sub.teamName === teamName &&
                            sub.playerIndex === index &&
                            sub.awardType === awardType &&
                            sub.startWeek <= week &&
                            (!sub.endWeek || sub.endWeek >= week)
                        );

                        let playerId;
                        if (activeSub) {
                            // Use substitute's Sleeper ID
                            playerId = activeSub.substitutePlayerId;
                            console.log(`Week ${week}: Using substitute ${activeSub.substituteName} (${playerId}) for ${teamName}`);
                        } else {
                            // ADDED: Check if roster exists before trying to find player
                            if (!roster) {
                                // No roster available (inactive team) - load from existing data
                                const awardScores = awardType === 'main' ? existingData.scores : existingData.nextUpScores;
                                scores[awardType][teamName][week][index] = awardScores?.[teamName]?.[week]?.[index] || 0;
                                return; // Skip to next player
                            }
                            // Use original player's Sleeper ID
                            playerId = this.findPlayerInRoster(originalPlayer, roster);
                        }

                        if (playerId && weekScores[playerId] !== undefined) {
                            // Check if this player is on bye this week
                            if (this.isPlayerOnBye(playerId, week)) {
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
                            // Manual override for DeVaughn Vele's historical scores
                            if (teamName === 'Kenyatta93' && awardType === 'nextup' &&
                                originalPlayer.name === 'DeVaughn Vele') {
                                if (week === 1) {
                                    scores[awardType][teamName][week][index] = 2.3;
                                    console.log(`Manual override: DeVaughn Vele Week 1 = 2.3 points`);
                                } else if (week === 2) {
                                    scores[awardType][teamName][week][index] = 7.3;
                                    console.log(`Manual override: DeVaughn Vele Week 2 = 7.3 points`);
                                } else {
                                    scores[awardType][teamName][week][index] = 0;
                                }
                            } else {
                                scores[awardType][teamName][week][index] = 0;
                                if (activeSub) {
                                    console.log(`No score found for substitute ${activeSub.substituteName} (${playerId})`);
                                }
                            }
                        }
                    });

                    // Validate Next Up Award combinations after scores are set
                    if (awardType === 'nextup') {
                        // Get both players' experience levels for this week
                        const player1Experience = this.getPlayerExperienceForWeek(teamName, 0, week, existingSubstitutions);
                        const player2Experience = this.getPlayerExperienceForWeek(teamName, 1, week, existingSubstitutions);

                        // Check if combination violates rookie+sophomore rule
                        if ((player1Experience === 'rookie' && player2Experience === 'rookie') ||
                            (player1Experience === 'sophomore' && player2Experience === 'sophomore')) {

                            console.log(`Invalid Next Up combination for ${teamName} Week ${week}: ${player1Experience} + ${player2Experience}`);

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

        return scores;
    }

    getPlayerExperienceForWeek(teamName, playerIndex, week, existingSubstitutions) {
        const originalDuo = this.knownDuos.nextup[teamName];
        if (!originalDuo) return 'unknown';

        // Check for active substitution
        const activeSub = existingSubstitutions.find(sub =>
            sub.teamName === teamName &&
            sub.playerIndex === playerIndex &&
            sub.awardType === 'nextup' &&
            sub.startWeek <= week &&
            (!sub.endWeek || sub.endWeek >= week)
        );

        if (activeSub) {
            // Map substitute to experience level
            const substituteExperience = this.getSubstituteExperience(activeSub.substituteName);
            console.log(`Substitute ${activeSub.substituteName} experience: ${substituteExperience}`);
            return substituteExperience;
        } else {
            // Use original player's experience
            return originalDuo[playerIndex].experience === 'second_year' ? 'sophomore' : originalDuo[playerIndex].experience;
        }
    }

    getSubstituteExperience(playerName) {
        // Map known substitutes to their experience levels
        const substituteMap = {
            'Michael Penix': 'rookie',
            'Ollie Gordon': 'rookie',
            // Add other substitutes as needed
        };

        return substituteMap[playerName] || 'unknown';
    }

    getPlayerExperienceForWeek(teamName, playerIndex, week, existingSubstitutions) {
        const originalDuo = this.knownDuos.nextup[teamName];
        if (!originalDuo) return 'unknown';

        // Check for active substitution
        const activeSub = existingSubstitutions.find(sub =>
            sub.teamName === teamName &&
            sub.playerIndex === playerIndex &&
            sub.awardType === 'nextup' &&
            sub.startWeek <= week &&
            (!sub.endWeek || sub.endWeek >= week)
        );

        if (activeSub) {
            // Map substitute to experience level
            // Ollie Gordon = rookie, J.J. McCarthy = sophomore, etc.
            const substituteExperience = this.getSubstituteExperience(activeSub.substituteName);
            console.log(`Substitute ${activeSub.substituteName} experience: ${substituteExperience}`);
            return substituteExperience;
        } else {
            // Use original player's experience
            return originalDuo[playerIndex].experience;
        }
    }

    getSubstituteExperience(playerName) {
        // Map known substitutes to their experience levels
        const substituteMap = {
            'Michael Penix': 'rookie',
            'Ollie Gordon': 'rookie',
            // Add other substitutes as needed
        };

        return substituteMap[playerName] || 'unknown';
    }

    // Add this helper method
    getActiveSubstitutionsForWeek(teamName, week, awardType) {
        // This would use the existing substitutions from your data
        // For now, return empty array since substitutions are handled elsewhere
        // You'll need to load existing substitutions here
        return [];
    }

    async generateCompleteData() {
        await this.initializeLeagueData();

        const currentWeek = await this.getCurrentWeek();
        const currentDay = new Date().getDay(); // 0=Sunday, 1=Monday, 2=Tuesday, 4=Thursday
        const currentHour = new Date().getHours();

        // Determine checkpoint type - REPLACE THIS ENTIRE SECTION
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
        } else if (currentDay === 2) { // Tuesday
            checkpointType = 'TUESDAY_CHECK';
            shouldRunSubstitutions = true;
        } else if (currentDay === 4) { // Thursday
            checkpointType = 'THURSDAY_CHECK';
            shouldRunSubstitutions = true;
        } else if (currentDay === 6 && currentHour >= 7) { // Saturday 7 AM - International prep
            checkpointType = 'SATURDAY_INTERNATIONAL_PREP';
            shouldRunSubstitutions = true;
        } else if (currentDay === 0 && currentHour >= 7 && currentHour < 11) { // Sunday 7-11 AM - International games
            checkpointType = 'SUNDAY_INTERNATIONAL_CHECK';
            shouldRunSubstitutions = true;
        } else if (currentDay === 0 && currentHour >= 11) { // Sunday after 11 AM - Regular games
            checkpointType = 'SUNDAY_PREGAME_CHECK';
            shouldRunSubstitutions = true;
        }

        console.log(`Current week: ${currentWeek}, Checkpoint: ${checkpointType || 'ROUTINE_UPDATE'}`);

        // Load existing data - KEEP THIS SECTION AS IS
        let existingData = {
            teams: [],
            nextUpTeams: [],
            scores: {},
            nextUpScores: {},
            substitutions: []
        };

        try {
            if (require('fs').existsSync('brown-bell-data.json')) {
                existingData = JSON.parse(require('fs').readFileSync('brown-bell-data.json', 'utf8'));
            }
        } catch (error) {
            console.log('No existing data found, creating fresh dataset');
        }

        // Clean up existing substitutions - KEEP THIS SECTION AS IS
        const cleanedSubstitutions = this.cleanupSubstitutions(existingData.substitutions, currentWeek);

        // Update scores (always do this) - KEEP THIS SECTION AS IS
        const allScores = await this.updateAllScores();

        // Generate new substitutions - REPLACE THIS SECTION
        let newSubstitutions = [];
        if (shouldRunSubstitutions) {
            if (checkpointType === 'INTERNATIONAL_CHECK' || checkpointType === 'SATURDAY_INTERNATIONAL_PREP' || checkpointType === 'SUNDAY_INTERNATIONAL_CHECK') {
                // Use the international game check
                newSubstitutions = await this.checkInternationalGameInjuries();
            } else if (checkpointType === 'PREGAME_CHECK' || checkpointType === 'SUNDAY_PREGAME_CHECK') {
                // Use the enhanced pre-game check
                newSubstitutions = await this.checkGameTimeInjuries();
            } else {
                // Use regular weekly substitution logic
                newSubstitutions = await this.generateWeeklySubstitutions(currentWeek, cleanedSubstitutions);
            }
            console.log(`${checkpointType}: Generated ${newSubstitutions.length} new substitutions`);
        }

        // Build teams data structure - KEEP THE REST OF THE METHOD AS IS
        const teams = [];
        const nextUpTeams = [];


        Object.entries(this.knownDuos.main).forEach(([teamName, duo]) => {
            const roster = this.leagueData.rosters.find(r =>
                this.leagueData.userMap[r.owner_id] === teamName
            );

            teams.push({
                name: teamName,
                players: duo.map(player => ({
                    ...player,
                    sleeperId: roster ? this.findPlayerInRoster(player, roster) : null
                })),
                sleeper_roster_id: roster ? roster.roster_id : null
            });
        });

        Object.entries(this.knownDuos.nextup).forEach(([teamName, duo]) => {
            const roster = this.leagueData.rosters.find(r =>
                this.leagueData.userMap[r.owner_id] === teamName
            );

            nextUpTeams.push({
                mainTeamName: teamName,
                name: `${teamName} (Next Up)`,
                players: duo.map(player => ({
                    ...player,
                    sleeperId: roster ? this.findPlayerInRoster(player, roster) : null
                })),
                sleeper_roster_id: roster ? roster.roster_id : null
            });
        });
        const updatedData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            currentWeek,
            currentAward: 'main',
            teams,
            nextUpTeams,
            scores: allScores.main,
            nextUpScores: allScores.nextup,
            substitutions: [...cleanedSubstitutions, ...newSubstitutions],
            inactiveTeams: this.inactiveTeams,  // ADD THIS LINE
            sleeperLeagueId: this.leagueId,
            lastAutomationRun: new Date().toISOString(),
            lastCheckpointType: checkpointType || 'ROUTINE_UPDATE',
            automationStats: {
                scoresUpdated: Object.keys(allScores.main).length + Object.keys(allScores.nextup).length,
                newSubstitutions: newSubstitutions.length,
                totalSubstitutions: cleanedSubstitutions.length + newSubstitutions.length,
                cleanedSubstitutions: existingData.substitutions.length - cleanedSubstitutions.length
            }
        };

        return updatedData;
    }

    async run() {
        try {
            console.log('🏈 Starting Brown Bell automation...');

            const data = await this.generateCompleteData();

            // Write to file
            fs.writeFileSync('brown-bell-data.json', JSON.stringify(data, null, 2));

            console.log('✅ Automation complete!');
            console.log(`📊 Updated ${data.automationStats.scoresUpdated} team scores`);
            console.log(`🔄 Generated ${data.automationStats.newSubstitutions} new substitutions`);
            console.log(`🧹 Cleaned up ${data.automationStats.cleanedSubstitutions} invalid substitutions`);
            console.log(`📅 Current week: ${data.currentWeek}`);

            return data;

        } catch (error) {
            console.error('❌ Automation failed:', error);
            throw error;
        }
    }
}



// Run automation
const leagueId = process.env.SLEEPER_LEAGUE_ID || '1126351965879164928';
const automator = new BrownBellAutomator(leagueId);

if (require.main === module) {
    automator.run()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = BrownBellAutomator;