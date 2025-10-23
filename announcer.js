const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const TOKEN = process.env.TOKEN;
const MILESTONE_FREQUENCY = parseInt(process.env.FREQUENCY);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

let lastAnnouncedVisits = {};
const path = './lastAnnouncedVisit.json';

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
            name: process.env.GAMENAME || "Game 1",
            universeId: process.env.UNIVERSEID,
            channelId: process.env.CHANNELID,
        });
    }

    // Additional numbered games
    while (true) {
        index++;
        const universe = process.env[`UNIVERSEID_${index}`];
        const channel = process.env[`CHANNELID_${index}`];
        const name = process.env[`GAMENAME_${index}`] || `Game ${index}`;
        if (!universe || !channel) break;
        games.push({ name, universeId: universe, channelId: channel });
    }

    return games;
}

async function checkMilestone(game) {
    try {
        const response = await axios.get(`https://games.roblox.com/v1/games?universeIds=${game.universeId}`);
        const data = response.data.data[0];
        if (!data) return console.error(`No data for ${game.name}`);

        const visitCount = data.visits;
        const lastVisit = lastAnnouncedVisits[game.universeId] || 0;
        const nextMilestone = Math.floor(visitCount / MILESTONE_FREQUENCY) * MILESTONE_FREQUENCY;

        if (visitCount >= lastVisit + MILESTONE_FREQUENCY) {
            lastAnnouncedVisits[game.universeId] = nextMilestone;
            const channel = await client.channels.fetch(game.channelId);
            await channel.send(`${game.name} has reached **${nextMilestone.toLocaleString()}** visits!`);
            saveLastAnnouncedVisits();
        }

        console.log(`${game.name}: ${visitCount} visits`);
    } catch (error) {
        console.error(`Error checking ${game.name}:`, error.message);
    }
}

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    loadLastAnnouncedVisits();

    const games = getGamesFromEnv();
    if (games.length === 0) return console.error("No valid UNIVERSEID/CHANNELID pairs found in .env");

    games.forEach(checkMilestone);
    setInterval(() => {
        games.forEach(checkMilestone);
    }, 300000);
});

client.login(TOKEN);
