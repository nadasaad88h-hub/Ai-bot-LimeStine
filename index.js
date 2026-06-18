const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const express = require('express');
const https = require('https'); // ✅ Built-in safe request handler

// 🤖 INITIALIZE DISCORD CLIENT
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// 🧠 INITIALIZE GEMINI AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 🧠 MEMORY CACHE FOR SEAMLESS CHAT FLOW
let lastChatState = {
    userId: null,
    channelId: null,
    timestamp: 0
};

// 🌐 EXPRESS KEEP-ALIVE SERVER FOR RENDER
const app = express();
app.get('/', (req, res) => res.send('LimeStine AI Core Online. 🍋'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web listener online on port ${PORT}`);
    
    // Auto-ping tool utilizing stable https module
    setInterval(() => {
        const PROJECT_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`;
        if (!process.env.RENDER_EXTERNAL_HOSTNAME) return; // Skip if local running
        
        https.get(PROJECT_URL, (res) => {
            console.log('💓 Heartbeat sent.');
        }).on('error', (err) => {
            console.error('⚠️ Heartbeat failed:', err.message);
        });
    }, 5 * 60 * 1000);
});

// 🚀 BOT READY EVENT
client.once('ready', () => {
    console.log(`🤖 LimeStine is logged in everywhere as ${client.user.tag}!`);
});

// 💬 CHAT EXECUTION LAYER
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const now = Date.now();
    const conversationalWindowMs = 45 * 1000; 

    const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;
    const isReplyToBot = message.reference && message.mentions.repliedUser?.id === client.user.id;
    
    const isContinuingConversation = 
        message.author.id === lastChatState.userId && 
        message.channelId === lastChatState.channelId && 
        (now - lastChatState.timestamp) < conversationalWindowMs;

    if (!isMentioned && !isReplyToBot && !isContinuingConversation) return;

    let userInput = message.content.replace(`<@${client.user.id}>`, '').trim();
    if (!userInput) return;

    await message.channel.sendTyping();

    try {
        const serverEmojis = message.guild?.emojis.cache.map(e => e.toString()).slice(0, 15).join(' ') || '';
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userInput,
            config: {
                systemInstruction: `Your name is LimeStine. You were created by Unbreakilo. You are a super chill, laid-back Discord companion. Keep answers short, natural, and highly conversational—no essays! Use a maximum of 1 or 2 emojis per sentence.

                You are allowed to use standard emojis or these specific server custom emojis if they fit: ${serverEmojis}.
                
                CRITICAL GIF RULE: SOMETIMES (only when highly relevant or funny), you can add a single GIF to your message. To do this, include the phrase "[GIF: theme]" at the very end of your response, replacing "theme" with a vivid search term matching your exact emotion or scenario (e.g., [GIF: cat falling down], [GIF: anime wave], [GIF: shock face]). Do not use it every time.`,
                maxOutputTokens: 150
            }
        });

        let replyText = response.text || "My bad, my gears locked up. Try saying that again. 🛠️";
        let payload = { content: replyText, allowedMentions: { repliedUser: true } };

        // 🖼️ DYNAMIC TENOR GIF SEARCH LAYER
        const gifRegex = /\[GIF:\s*(.+?)\]/i;
        const match = replyText.match(gifRegex);
        
        if (match) {
            const gifTheme = match[1].toLowerCase().trim();
            payload.content = replyText.replace(gifRegex, '').trim(); 

            const tenorKey = process.env.TENOR_API_KEY || "LIVDSRZULERH"; 
            const searchUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifTheme)}&key=${tenorKey}&client_key=limestine_bot&limit=1&media_filter=gif`;

            // Wrap https stream inside a promise to wait cleanly for data
            const fetchGif = () => new Promise((resolve, reject) => {
                https.get(searchUrl, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve(JSON.parse(data)));
                }).on('error', (err) => reject(err));
            });

            try {
                const searchData = await fetchGif();
                if (searchData.results && searchData.results.length > 0) {
                    const fetchedGifUrl = searchData.results[0].media_formats.gif.url;
                    payload.content += `\n${fetchedGifUrl}`; 
                }
            } catch (gifErr) {
                console.error('Failed to grab live GIF from Tenor:', gifErr.message);
            }
        }

        // 🎫 RANDOM SERVER STICKER CHANCE (15%)
        if (message.guild && Math.random() < 0.15) {
            const availableStickers = message.guild.stickers.cache.filter(s => s.available);
            if (availableStickers.size > 0) {
                const randomSticker = availableStickers.random();
                payload.stickers = [randomSticker.id];
            }
        }

        // 📝 UPDATE CONVERSATION MEMORY LAYER
        lastChatState = {
            userId: message.author.id,
            channelId: message.channelId,
            timestamp: Date.now()
        };

        await message.reply(payload);

    } catch (err) {
        console.error('AI Processing Error:', err);
        await message.reply({ content: "Brain lag... can't process right now. 🌫️" }).catch(() => {});
    }
});

client.login(process.env.TOKEN);
