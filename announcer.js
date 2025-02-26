const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const fs = require("fs")
require("dotenv").config();

const TOKEN = process.env.TOKEN
const CHANNEL_ID = process.env.CHANNELID
const UNIVERSE_ID = process.env.UNIVERSEID
const MILESTONE_FREQUENCY = process.env.FREQUENCY
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

let lastAnnouncedVisit = 0;
const path = './lastAnnouncedVisit.json';

function loadLastAnnouncedVisit() {
    if (fs.existsSync(path)) {
        const data = JSON.parse(fs.readFileSync(path));
        lastAnnouncedVisit = data.lastAnnouncedVisit || 0;
    } else {
        fs.writeFileSync(path, JSON.stringify({ lastAnnouncedVisit: 0 }));
    }
}

function saveLastAnnouncedVisit() {
    fs.writeFileSync(path, JSON.stringify({ lastAnnouncedVisit }));
}

async function checkMilestone() {
    try {
        const response = await axios.get(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`);
        const data = response.data.data[0];

        if (!data) return console.error("Data not found");

        const visitCount = data.visits;
        console.log(`Current visits: ${visitCount}`);
        const nextMilestone = Math.floor(visitCount / MILESTONE_FREQUENCY) * MILESTONE_FREQUENCY;
        console.log(visitCount)
        console.log(lastAnnouncedVisit+MILESTONE_FREQUENCY)
        if (visitCount > lastAnnouncedVisit + MILESTONE_FREQUENCY) {
            lastAnnouncedVisit = nextMilestone;
            const channel = await client.channels.fetch(CHANNEL_ID);
            channel.send(`Game has reached **${nextMilestone.toLocaleString()}** visits!`);
            saveLastAnnouncedVisit();
        }
    } catch (error) {
        console.error("Error fetching game data:", error);
    }
}

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    loadLastAnnouncedVisit();
    checkMilestone(); // Run on startup
    setInterval(checkMilestone, 10000); // Check every 5 minutes (300,000 ms)
});

client.login(TOKEN);
