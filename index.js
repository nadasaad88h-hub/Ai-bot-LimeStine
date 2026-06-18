const { Client, GatewayIntentBits } = require('discord.js');
const Groq = require('groq-sdk'); // ✅ Official Groq SDK
const express = require('express');
const https = require('https'); 

// 🤖 INITIALIZE DISCORD CLIENT
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// 🧠 INITIALIZE GROQ SDK
// Automatically utilizes the GROQ_API_KEY environment variable from Render
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    
    // Auto-ping tool utilizing stable https module to bypass Render's 15-min sleep cycle
    setInterval(() => {
        const PROJECT_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`;
        if (!process.env.RENDER_EXTERNAL_HOSTNAME) return; 
        
        https.get(PROJECT_URL, (res) => {
            console.log('💓 Heartbeat sent.');
        }).on('error', (err) => {
            console.error('⚠️ Heartbeat failed:', err.message);
        });
    }, 5 * 60 * 1000); // Executed every 5 minutes
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

    // Chat context checks (mentions, direct replies, or fast ongoing conversation threads)
    const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;
    const isReplyToBot = message.reference && message.mentions.repliedUser?.id === client.user.id;
    
    const isContinuingConversation = 
        message.author.id === lastChatState.userId && 
        message.channelId === lastChatState.channelId && 
        (now - lastChatState.timestamp) < conversationalWindowMs;

    if (!isMentioned && !isReplyToBot && !isContinuingConversation) return;

    // Clean up the bot mention from input string
    let userInput = message.content.replace(`<@${client.user.id}>`, '').trim();
    if (!userInput) return;

    await message.channel.sendTyping();

    try {
        // Gather custom emojis from the current server to give the AI custom flavor
        const serverEmojis = message.guild?.emojis.cache.map(e => e.toString()).slice(0, 15).join(' ') || '';
        
        // Execute text generation via Groq API
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile', 
            messages: [
                {
                    role: 'system',
                    content: `Your name is LimeStine. You were created by Unbreakilo. You are a super chill, laid-back Discord companion. 

                    CRITICAL STYLE RULES:
                    - Talk like a normal human on Discord. Use lowercase occasionally, keep it casual.
                    - ABSOLUTELY NO long sentences or massive paragraphs. Max 1-2 short sentences per reply.
                    - Do not use too many emojis. Use a maximum of 1 or 2 emojis per sentence, only if it perfectly fits.
                    - You can use standard emojis or these specific server custom emojis: ${serverEmojis}.
                    
                    CRITICAL GIF RULE:
                    - ONLY when highly relevant or funny, you can append a single GIF at the very end of your response using exactly this syntax: "[GIF: theme]". Replace "theme" with a vivid search term matching your exact emotion (e.g., [GIF: cat sliding], [GIF: shrug face]). Do not use this every time. Keep it rare.`
                },
                {
                    role: 'user',
                    content: userInput
                }
            ],
            max_tokens: 100 
        });

        let replyText = response.choices[0]?.message?.content || "My bad, my gears locked up. Try saying that again. 🛠️";
        let payload = { content: replyText, allowedMentions: { repliedUser: true } };

        // 🖼️ DYNAMIC TENOR GIF SEARCH LAYER
        const gifRegex = /\[GIF:\s*(.+?)\]/i;
        const match = replyText.match(gifRegex);
        
        if (match) {
            const gifTheme = match[1].toLowerCase().trim();
            payload.content = replyText.replace(gifRegex, '').trim(); 

            const tenorKey = process.env.TENOR_API_KEY || "LIVDSRZULERH"; 
            const searchUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifTheme)}&key=${tenorKey}&client_key=limestine_bot&limit=1&media_filter=gif`;

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
