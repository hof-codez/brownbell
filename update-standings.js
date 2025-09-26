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
                'HofDimez': [
                    { name: 'Emeka Egbuka', position: 'WR', experience: 'rookie' },
                    { name: 'J.J. McCarthy', position: 'QB', experience: '2nd_year' }
                ],
                'Ch3r0k33zY': [
                    { name: 'Tetairoa McMillan', position: 'WR', experience: 'rookie' },
                    { name: 'Bucky Irving', position: 'RB', experience: '2nd_year' }
                ],
                // Add remaining Next Up duos...
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
        // Use league leg or calculate from current date
        return this.leagueData.league.leg || Math.min(18, Math.max(1, 
            Math.floor((Date.now() - new Date('2024-09-05').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
        ));
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

    async findSubstitute(teamName, injuredPlayer, week, awardType) {
        const roster = this.leagueData.rosters.find(r => 
            this.leagueData.userMap[r.owner_id] === teamName
        );
        
        if (!roster) return null;

        // Get recent scoring data
        const currentWeekScores = await this.getWeeklyScores(week);
        const previousWeekScores = week > 1 ? await this.getWeeklyScores(week - 1) : {};
        
        const eligibleSubs = [];
        const originalDuo = this.knownDuos[awardType][teamName];
        const healthyPartner = originalDuo.find((_, i) => i !== injuredPlayer.index);

        if (!roster.players) return null;

        roster.players.forEach(playerId => {
            const player = this.playersData[playerId];
            if (!player || !['QB', 'RB', 'WR'].includes(player.position)) return;
            
            // Skip if this is the injured player
            if (playerId === injuredPlayer.playerId) return;
            
            // Skip if injured
            if (player.injury_status && ['out', 'doubtful', 'ir'].includes(player.injury_status.toLowerCase())) {
                return;
            }

            // Check position compatibility
            const newCombo = [healthyPartner.position, player.position].sort().join('+');
            const validCombos = ['QB+RB', 'QB+WR', 'RB+WR'];
            if (!validCombos.includes(newCombo)) return;

            // Award type eligibility
            if (awardType === 'nextup') {
                const yearsExp = player.years_exp || 0;
                if (yearsExp > 1) return;
            }

            const combinedScore = (currentWeekScores[playerId] || 0) + (previousWeekScores[playerId] || 0);
            
            eligibleSubs.push({
                id: playerId,
                name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
                position: player.position,
                score: combinedScore,
                yearsExp: player.years_exp || 0
            });
        });

        // Return best scoring eligible substitute
        eligibleSubs.sort((a, b) => b.score - a.score);
        return eligibleSubs.length > 0 ? eligibleSubs[0] : null;
    }

    async generateSubstitutions(week) {
        console.log('Generating automatic substitutions...');
        
        const injuries = await this.detectInjuries(week);
        const substitutions = [];

        for (const awardType of ['main', 'nextup']) {
            for (const [teamName, teamInjuries] of Object.entries(injuries[awardType])) {
                for (const injury of teamInjuries) {
                    const substitute = await this.findSubstitute(teamName, injury, week, awardType);
                    
                    if (substitute) {
                        substitutions.push({
                            teamName,
                            playerIndex: injury.index,
                            awardType,
                            originalName: injury.originalPlayer.name,
                            originalPosition: injury.originalPlayer.position,
                            substituteName: substitute.name,
                            substitutePlayerId: substitute.id,
                            substitutePosition: substitute.position,
                            startWeek: week,
                            endWeek: null,
                            active: true,
                            autoGenerated: true,
                            reason: `Injury substitution (${injury.status})`
                        });
                        
                        console.log(`Auto-sub: ${teamName} ${awardType} - ${substitute.name} for ${injury.originalPlayer.name}`);
                    }
                }
            }
        }

        return substitutions;
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

        // Update scores
        const allScores = await this.updateAllScores();
        
        // Generate weekly substitutions (only on Tuesdays)
        let newSubstitutions = [];
        if (isWeeklySubDay) {
            newSubstitutions = await this.generateSubstitutions(currentWeek);
            
            // Deactivate old auto-generated substitutions
            existingData.substitutions.forEach(sub => {
                if (sub.autoGenerated && sub.active && sub.startWeek < currentWeek) {
                    sub.active = false;
                    sub.endWeek = currentWeek - 1;
                }
            });
        }

        // Build teams data structure
        const teams = [];
        const nextUpTeams = [];

        Object.entries(this.knownDuos.main).forEach(([teamName, duo]) => {
            teams.push({
                name: teamName,
                players: duo
            });
        });

        Object.entries(this.knownDuos.nextup).forEach(([teamName, duo]) => {
            nextUpTeams.push({
                mainTeamName: teamName,
                name: `${teamName} (Next Up)`,
                players: duo
            });
        });

        const updatedData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            currentWeek,
            teams,
            nextUpTeams,
            scores: allScores.main,
            nextUpScores: allScores.nextup,
            substitutions: [...existingData.substitutions, ...newSubstitutions],
            sleeperLeagueId: this.leagueId,
            lastAutomationRun: new Date().toISOString(),
            automationStats: {
                scoresUpdated: Object.keys(allScores.main).length + Object.keys(allScores.nextup).length,
                newSubstitutions: newSubstitutions.length,
                totalSubstitutions: existingData.substitutions.length + newSubstitutions.length
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