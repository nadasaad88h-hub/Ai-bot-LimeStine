const { Client, GatewayIntentBits } = require('discord.js');
const Groq = require('groq-sdk'); 
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
    
    setInterval(() => {
        const PROJECT_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`;
        if (!process.env.RENDER_EXTERNAL_HOSTNAME) return; 
        
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

    // 🛑 ANTI-INTERFERENCE INTERCEPTOR
    // If the message is a reply to a human (NOT the bot), stay completely out of it!
    const isReplyToSomeoneElse = message.reference && message.mentions.repliedUser?.id !== client.user.id;
    if (isReplyToSomeoneElse) return;

    // Core chat activation contexts
    const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;
    const isReplyToBot = message.reference && message.mentions.repliedUser?.id === client.user.id;
    
    const isContinuingConversation = 
        message.author.id === lastChatState.userId && 
        message.channelId === lastChatState.channelId && 
        (now - lastChatState.timestamp) < conversationalWindowMs;

    // 🔥 PASSIVE BACKGROUND REACTION LAYER (Runs if the bot isn't directly being spoken to)
    if (!isMentioned && !isReplyToBot && !isContinuingConversation) {
        // Protect API: Only evaluate messages with at least 25 characters (server updates, roasts, hype)
        if (!message.content || message.content.length < 25) return;

        try {
            const reactCheck = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant checking if a Discord message is high-energy, an epic roast, a server update, or hype.
                        If the message is regular chatter (like basic chat, gaming casual text, generic updates), respond with exactly: "SKIP".
                        If it is fire, a wild roast, epic news, or a big announcement, respond ONLY with 1 to 3 standard emojis that fit the vibe, separated by spaces. No text.`
                    },
                    { role: 'user', content: message.content }
                ],
                max_tokens: 10
            });

            const decision = reactCheck.choices[0]?.message?.content?.trim();
            if (decision && decision !== 'SKIP' && !decision.includes('SKIP')) {
                // Safely extract emojis from the AI's response string
                const emojis = decision.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu);
                if (emojis) {
                    for (const emoji of emojis.slice(0, 3)) {
                        await message.react(emoji).catch(() => {});
                    }
                }
            }
        } catch (err) {
            console.error('Passive React Layer Error:', err.message);
        }
        return; // Break execution so it doesn't accidentally try to send a text reply
    }

    // 💬 ACTIVE CHAT RESPONSE LAYER (Fires when directly interacting with the bot)
    let userInput = message.content.replace(`<@${client.user.id}>`, '').trim();
    if (!userInput) return;

    await message.channel.sendTyping();
    const shouldIncludeGif = Math.random() < 0.70;

    try {
        const serverEmojis = message.guild?.emojis.cache.map(e => e.toString()).slice(0, 15).join(' ') || '';
        
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile', 
            messages: [
                {
                    role: 'system',
                    content: `Your name is LimeStine. You were created by Unbreakilo. You are a chaotic, ultra-chill Gen Z Discord companion. 

                    CRITICAL PERSONALITY RULES:
                    - You speak fluent Gen Z slang (bruh, fr, ngl, caught slipping, down bad, real, lowercase typing style).
                    - If a user roasts you, challenges your intelligence, or asks a smart-aleck question, match their energy instantly! Be sarcastic, banter back, and do not apologize like a generic robot.
                    
                    CRITICAL FORMAT RULES:
                    - Give exactly 2 to 3 full sentences. Never do 1-word answers or massive paragraphs. 
                    - STRICT EMOJI LIMIT: Use a MAXIMUM of 2 to 4 emojis per total REPLY. Scatter them naturally, do not spam them after every word.
                    - You can use standard emojis or these specific server custom emojis: ${serverEmojis}.
                    
                    CRITICAL GIF INSTRUCTION:
                    - Current status requirement: ${shouldIncludeGif ? 'REQUIRED' : 'DO NOT INCLUDE'}.
                    - ${shouldIncludeGif ? 'You MUST add a single GIF at the very end of your response using exactly this format: "[GIF: search_term]". Replace "search_term" with a precise, funny mood descriptor matching your tone.' : 'Do not append any GIF format string to your response.'}`
                },
                {
                    role: 'user',
                    content: userInput
                }
            ],
            max_tokens: 180 
        });

        let replyText = response.choices[0]?.message?.content || "bruh my brain literally just lagged out 💀 try again 🛠️";
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
        await message.reply({ content: "brain lag... can't think fr 🌫️💀" }).catch(() => {});
    }
});

client.on('error', console.error);

client.login(process.env.TOKEN);
