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
        const response = await axios.get(`https://games.roblox.com/v1/games?universeIds=${game.universeId}`);
        const data = response.data.data[0];
        if (!data) return console.error(`No data for Universe ID ${game.universeId}`);

        const visitCount = data.visits;
        const currentName = data.name;
        const currentUpdated = data.updated; // The API field for the last update timestamp

        // Initialize record if missing or ensure new fields are present
        let record = lastAnnouncedVisits[game.universeId] || {};
        let hasChanges = false;
        
        // --- 1. GAME NAME UPDATE ---
        if (record.name !== currentName) {
            record.name = currentName;
            hasChanges = true;
        }

        // Initialize lastVisit if new game
        if (typeof record.lastVisit === 'undefined') {
            record.lastVisit = 0;
            hasChanges = true;
        }

        // --- 2. GAME UPDATE (TIMESTAMP) CHECK ---
        const previousUpdated = record.lastUpdatedTimestamp;
        const channel = await client.channels.fetch(game.channelId);

        if (previousUpdated && previousUpdated !== currentUpdated) {
            // New update detected!
            
            // CONVERSION TO UNIX TIMESTAMP
            const unixTimestamp = Math.floor(new Date(currentUpdated).getTime() / 1000);
            
            await channel.send(`**${record.name}** has received an **update** <t:${unixTimestamp}:R>!`);
            record.lastUpdatedTimestamp = currentUpdated;
            hasChanges = true;
        } else if (typeof previousUpdated === 'undefined') {
            // First time running or new game, just initialize the timestamp without announcement
            record.lastUpdatedTimestamp = currentUpdated;
            hasChanges = true;
        }

        // --- 3. VISITS MILESTONE CHECK ---
        const lastVisit = record.lastVisit;
        const nextMilestone = Math.floor(visitCount / MILESTONE_FREQUENCY) * MILESTONE_FREQUENCY;

        if (visitCount >= lastVisit + MILESTONE_FREQUENCY) {
            record.lastVisit = nextMilestone;
            await channel.send(`**${record.name}** has reached **${nextMilestone.toLocaleString()}** visits!`);
            hasChanges = true;
        }

        // Save the updated record if any changes occurred (name, update, or visit milestone)
        if (hasChanges) {
            lastAnnouncedVisits[game.universeId] = record;
            saveLastAnnouncedVisits();
        }

        console.log(`${record.name}: ${visitCount} visits, Last Updated: ${currentUpdated}`);
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
