// update-standings.js - GitHub Actions automation script
const fs = require('fs');
const https = require('https');

class BrownBellAutomator {
    constructor(leagueId) {
        this.leagueId = leagueId;
        this.playersData = null;
        this.leagueData = null;

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
                    { name: 'DeVaughn Vele', position: 'WR', experience: 'second_year' }  // Note the capital V
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
        console.log('Detecting player injuries...');

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
        const roster = this.leagueData.rosters.find(r =>
            this.leagueData.userMap[r.owner_id] === teamName
        );

        if (!roster) return null;

        const originalDuo = this.knownDuos[awardType][teamName];
        if (!originalDuo || !roster.players) return null;

        const eligibleSubs = [];

        for (const playerId of roster.players) {
            const player = this.playersData[playerId];
            if (!player || !['QB', 'RB', 'WR'].includes(player.position)) continue;

            // Skip if this is the injured player
            if (playerId === injuredPlayer.playerId) continue;

            // Skip if this player is in the Next Up duo (for Main Award)
            if (awardType === 'main' && this.isPlayerInNextUpDuo(playerId, teamName)) {
                const playerName = `${player.first_name} ${player.last_name}`.trim();
                console.log(`🚫 SKIPPING ${playerName} (${playerId}) - reserved for Next Up Award for team ${teamName}`);
                continue;
            }

            // Skip if injured
            if (player.injury_status && ['out', 'doubtful', 'ir'].includes(player.injury_status.toLowerCase())) {
                continue;
            }

            const substitute = {
                id: playerId,
                name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
                position: player.position,
                yearsExp: player.years_exp || 0
            };

            // Validate substitution
            if (!this.validateSubstitution(teamName, originalDuo, injuredPlayer.index, substitute, awardType)) {
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

        if (eligibleSubs.length === 0) return null;

        // Sort by total score and randomly select from top 5
        eligibleSubs.sort((a, b) => b.score - a.score);
        const topPerformers = eligibleSubs.slice(0, Math.min(5, eligibleSubs.length));

        // Manual override for specific Week 4 Ch3r0k33zY substitution
        if (teamName === 'Ch3r0k33zY' && week === 4 && awardType === 'main') {
            const zayFlowers = topPerformers.find(sub =>
                sub.name.toLowerCase().includes('zay flowers') ||
                sub.name.toLowerCase().includes('flowers')
            );

            if (zayFlowers) {
                console.log(`Manual preference: Selected Zay Flowers for ${teamName} Week ${week} instead of random selection`);
                return zayFlowers;
            }
        }

        // Default random selection for all other cases
        const randomIndex = Math.floor(Math.random() * topPerformers.length);
        const selectedSub = topPerformers[randomIndex];

        console.log(`Selected ${selectedSub.name} (${selectedSub.score.toFixed(1)} pts over 3 weeks) from top ${topPerformers.length} available for ${teamName}`);

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
        console.log(`Generating weekly substitutions for week ${week}...`);

        const injuries = await this.detectInjuries(week);
        const weeklySubstitutions = [];

        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                for (const injury of teamInjuries) {
                    // Check if we already have an active substitution for this exact scenario
                    const hasActiveSub = this.hasActiveSubstitution(
                        teamName, injury.index, week, awardType, existingSubstitutions
                    );

                    if (hasActiveSub) {
                        console.log(`Substitution already exists: ${teamName} ${awardType} player ${injury.index} week ${week}`);
                        continue; // Skip - already have a sub for this player this week
                    }

                    // Only create new substitution if none exists
                    const substitute = await this.findSubstitute(teamName, injury, week, awardType);

                    if (substitute) {
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
                            reason: `Injury Checkpoint (3) - ${injury.status}`
                        });

                        console.log(`New auto-sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name} (Week ${week})`);
                    } else {
                        console.log(`No suitable substitute found: ${teamName} ${awardType} for ${injury.originalPlayer.name}`);
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

        // Process each award type
        for (const awardType of ['main', 'nextup']) {
            const duos = this.knownDuos[awardType];

            for (const [teamName, originalDuo] of Object.entries(duos)) {
                scores[awardType][teamName] = {};

                const roster = this.leagueData.rosters.find(r =>
                    this.leagueData.userMap[r.owner_id] === teamName
                );

                if (!roster) continue;

                // Get scores for each week up to current
                for (let week = 1; week <= currentWeek; week++) {
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
                            // Use original player's Sleeper ID
                            playerId = this.findPlayerInRoster(originalPlayer, roster);
                        }

                        if (playerId && weekScores[playerId] !== undefined) {
                            scores[awardType][teamName][week][index] = weekScores[playerId];
                            if (activeSub) {
                                console.log(`Substitute score: ${activeSub.substituteName} = ${weekScores[playerId]} points`);
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
                }
            }
        }

        return scores;
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
                    sleeperId: this.findPlayerInRoster(player, roster)
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
                    sleeperId: this.findPlayerInRoster(player, roster)
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