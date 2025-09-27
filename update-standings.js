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
                    { name: 'Devaughn Vele', position: 'WR', experience: 'second_year' }
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
        const previousWeekScores = week > 1 ? await this.getWeeklyScores(week - 1) : {};

        const injuries = {
            main: {},
            nextup: {}
        };

        // Check both award types
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
                        const currentScore = weekScores[playerId] || 0;
                        const previousScore = previousWeekScores[playerId] || 0;

                        // Injury detection heuristics
                        let injuryStatus = 'healthy';

                        if (player.injury_status) {
                            const status = player.injury_status.toLowerCase();
                            if (['out', 'doubtful', 'ir', 'pup'].includes(status)) {
                                injuryStatus = 'out';
                            } else if (status === 'questionable') {
                                injuryStatus = 'questionable';
                            }
                        } else if (currentScore === 0 && previousScore === 0) {
                            injuryStatus = 'questionable'; // Suspicious low scoring
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

        const currentWeekScores = await this.getWeeklyScores(week);
        const previousWeekScores = week > 1 ? await this.getWeeklyScores(week - 1) : {};
        const originalDuo = this.knownDuos[awardType][teamName];

        if (!originalDuo || !roster.players) return null;

        const eligibleSubs = [];

        roster.players.forEach(playerId => {
            const player = this.playersData[playerId];
            if (!player || !['QB', 'RB', 'WR'].includes(player.position)) return;

            // Skip if this is the injured player
            if (playerId === injuredPlayer.playerId) return;

            // Skip if injured
            if (player.injury_status && ['out', 'doubtful', 'ir'].includes(player.injury_status.toLowerCase())) {
                return;
            }

            const substitute = {
                id: playerId,
                name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
                position: player.position,
                yearsExp: player.years_exp || 0
            };

            // USE ENHANCED VALIDATION HERE
            if (!this.validateSubstitution(teamName, originalDuo, injuredPlayer.index, substitute, awardType)) {
                return; // Skip invalid substitutions
            }

            const combinedScore = (currentWeekScores[playerId] || 0) + (previousWeekScores[playerId] || 0);
            substitute.score = combinedScore;

            eligibleSubs.push(substitute);
        });

        // Return best scoring eligible substitute
        eligibleSubs.sort((a, b) => b.score - a.score);
        return eligibleSubs.length > 0 ? eligibleSubs[0] : null;
    }

    hasActiveSubstitution(teamName, playerIndex, week, awardType, existingSubstitutions) {
        return existingSubstitutions.some(sub =>
            sub.teamName === teamName &&
            sub.playerIndex === playerIndex &&
            sub.awardType === awardType &&
            sub.active &&
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
                    // For main award: always generate new weekly sub if injured
                    // For nextup: only if no existing active sub (static substitutions)
                    const hasActiveSub = this.hasActiveSubstitution(
                        teamName, injury.index, week, awardType, existingSubstitutions
                    );

                    const shouldCreateSub = awardType === 'main' || !hasActiveSub;

                    if (shouldCreateSub) {
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
                                endWeek: awardType === 'main' ? week : null, // Weekly for main, ongoing for nextup
                                active: true,
                                autoGenerated: true,
                                reason: `${awardType === 'main' ? 'Weekly' : 'Permanent'} injury substitution (${injury.status})`
                            });

                            console.log(`Auto-sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name} (Week ${week})`);
                        }
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

    async updateAllScores() {
        console.log('Updating all weekly scores...');

        const currentWeek = await this.getCurrentWeek();
        const scores = { main: {}, nextup: {} };

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
                        const playerId = this.findPlayerInRoster(originalPlayer, roster);
                        if (playerId && weekScores[playerId] !== undefined) {
                            scores[awardType][teamName][week][index] = weekScores[playerId];
                        } else {
                            scores[awardType][teamName][week][index] = 0;
                        }
                    });
                }
            }
        }

        return scores;
    }

    async generateCompleteData() {
        await this.initializeLeagueData();

        const currentWeek = await this.getCurrentWeek();
        const isWeeklySubDay = new Date().getDay() === 2; // Tuesday

        console.log(`Current week: ${currentWeek}, Weekly sub day: ${isWeeklySubDay}`);

        // Load existing data if available
        let existingData = {
            teams: [],
            nextUpTeams: [],
            scores: {},
            nextUpScores: {},
            substitutions: []
        };

        try {
            if (fs.existsSync('brown-bell-data.json')) {
                existingData = JSON.parse(fs.readFileSync('brown-bell-data.json', 'utf8'));
            }
        } catch (error) {
            console.log('No existing data found, creating fresh dataset');
        }

        // Clean up existing substitutions
        const cleanedSubstitutions = this.cleanupSubstitutions(existingData.substitutions, currentWeek);

        // Update scores
        const allScores = await this.updateAllScores();

        // Generate weekly substitutions (only on Tuesdays or manual trigger)
        let newSubstitutions = [];
        if (isWeeklySubDay || process.env.FORCE_SUBSTITUTIONS === 'true') {
            newSubstitutions = await this.generateWeeklySubstitutions(currentWeek, cleanedSubstitutions);
        }

        // Build teams data structure
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
            currentAward: 'main', // Default to main award
            teams,
            nextUpTeams,
            scores: allScores.main,
            nextUpScores: allScores.nextup,
            substitutions: [...cleanedSubstitutions, ...newSubstitutions],
            sleeperLeagueId: this.leagueId,
            lastAutomationRun: new Date().toISOString(),
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