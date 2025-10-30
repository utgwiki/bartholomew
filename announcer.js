const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const TOKEN = process.env.TOKEN;
const MILESTONE_FREQUENCY = parseInt(process.env.FREQUENCY);
const path = './visitchecker.json';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

let lastAnnouncedVisits = {};

function loadLastAnnouncedVisits() {
    if (fs.existsSync(path)) {
        lastAnnouncedVisits = JSON.parse(fs.readFileSync(path));
    } else {
        fs.writeFileSync(path, JSON.stringify({}));
    }
}

function saveLastAnnouncedVisits() {
    fs.writeFileSync(path, JSON.stringify(lastAnnouncedVisits, null, 2));
}

function getGamesFromEnv() {
    const games = [];
    let index = 1;

    // Base game
    if (process.env.UNIVERSEID && process.env.CHANNELID) {
        games.push({
            universeId: process.env.UNIVERSEID,
            channelId: process.env.CHANNELID,
        });
    }

    // Additional numbered games
    while (true) {
        index++;
        const universe = process.env[`UNIVERSEID_${index}`];
        const channel = process.env[`CHANNELID_${index}`];
        if (!universe || !channel) break;
        games.push({ universeId: universe, channelId: channel });
    }

    return games;
}

async function checkMilestone(game) {
    try {
        // Fetch Game Details (Visits, Name, Last Updated)
        const gameResponse = await axios.get(`https://games.roblox.com/v1/games?universeIds=${game.universeId}`);
        const gameData = gameResponse.data.data[0];
        if (!gameData) return console.error(`No game data for Universe ID ${game.universeId}`);

        // Fetch Places/Subpages
        // placesData contains objects like: { id: 12345, name: "Place Name" }
        const placesResponse = await axios.get(`https://develop.roblox.com/v1/universes/${game.universeId}/places?sortOrder=Asc&limit=100`);
        const placesData = placesResponse.data.data;
        
        // Extract current Place IDs and create a map for easy lookup
        const currentPlaceMap = placesData.reduce((map, place) => {
            map[place.id] = place.name;
            return map;
        }, {});
        const currentPlaceIds = Object.keys(currentPlaceMap).map(id => parseInt(id));

        const visitCount = gameData.visits;
        const currentName = gameData.name;
        const currentUpdated = gameData.updated;

        let record = lastAnnouncedVisits[game.universeId] || {};
        let hasChanges = false;
        
        // 1. GAME NAME UPDATE
        if (record.name !== currentName) {
            record.name = currentName;
            hasChanges = true;
        }

        if (typeof record.lastVisit === 'undefined') {
            record.lastVisit = 0;
            hasChanges = true;
        }

        // --- UPDATED: 2. CHECK FOR NEW PLACES/SUBPAGES ---
        const previousPlaceIds = record.placeIds || [];
        const newPlaceIds = currentPlaceIds.filter(id => !previousPlaceIds.includes(id));
        const channel = await client.channels.fetch(game.channelId);

        if (newPlaceIds.length > 0) {
            const placeCount = newPlaceIds.length;
            
            // Generate the list of new places with names and links
            const newPlacesList = newPlaceIds.map(id => {
                const name = currentPlaceMap[id] || `- Unknown Place (${id})`;
                return `- [${name}](<https://www.roblox.com/games/${id}>)`;
            }).join('\n');
            
            // Construct the final announcement message
            const message = `<@&1360880411114209340> **${record.name}** has ${placeCount} new subplace${placeCount > 1 ? 's' : ''}!\n` +
                            `${newPlacesList}`;
            
            await channel.send(message);
            
            // Update the record to include all current places
            record.placeIds = currentPlaceIds;
            hasChanges = true;
        } else {
            // Ensure the record reflects the current list even if no new ones are found
            record.placeIds = currentPlaceIds; 
        }

        // 3. GAME UPDATE (TIMESTAMP) CHECK
        const previousUpdated = record.lastUpdatedTimestamp;

        if (previousUpdated && previousUpdated !== currentUpdated) {
            // New update detected!
            const unixTimestamp = Math.floor(new Date(currentUpdated).getTime() / 1000);
            
            await channel.send(`<@&1360880411114209340> **${record.name}** updated <t:${unixTimestamp}:R>!`);
            record.lastUpdatedTimestamp = currentUpdated;
            hasChanges = true;
        } else if (typeof previousUpdated === 'undefined') {
            record.lastUpdatedTimestamp = currentUpdated;
            hasChanges = true;
        }

        // 4. VISITS MILESTONE CHECK
        const lastVisit = record.lastVisit;
        const nextMilestone = Math.floor(visitCount / MILESTONE_FREQUENCY) * MILESTONE_FREQUENCY;

        if (visitCount >= lastVisit + MILESTONE_FREQUENCY) {
            record.lastVisit = nextMilestone;
            await channel.send(`<@&1360880411114209340> ${record.name} has reached **${nextMilestone.toLocaleString()}** visits!`);
            hasChanges = true;
        }

        // Save the updated record if any changes occurred
        if (hasChanges) {
            lastAnnouncedVisits[game.universeId] = record;
            saveLastAnnouncedVisits();
        }

        console.log(`${record.name}: ${visitCount} visits, Places: ${currentPlaceIds.length}`);
    } catch (error) {
        console.error(`Error checking Universe ID ${game.universeId}:`, error.message);
    }
}

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    loadLastAnnouncedVisits();

    const games = getGamesFromEnv();
    if (games.length === 0) return console.error("No valid UNIVERSEID/CHANNELID pairs found in .env");

    // Initial check
    games.forEach(checkMilestone);
    
    // Set up the interval for continuous checking (every 5 minutes)
    setInterval(() => {
        games.forEach(checkMilestone);
    }, 300000); 
});

client.login(TOKEN);
