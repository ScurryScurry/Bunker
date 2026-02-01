/* server.js - FIX FOR PROFESSIONS */
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const CardEngine = require('./modules/cardEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- 1. БАЗА ДАНИХ ---
const DB = {
    professions: [], hobbies: [], health: [], fears: [],
    items_small: [], items_big: [], facts: [], 
    disasters: [], bunkers: [], cards: [], config: {}
};

function parseCSV(filePath) {
    try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        const lines = fileData.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return [];
        const headers = lines[0].trim().split(';');
        return lines.slice(1).map(line => {
            const v = line.trim().split(';');
            let obj = {}; 
            headers.forEach((h, i) => obj[h] = v[i] ? v[i].trim() : ""); 
            return obj;
        });
    } catch (e) { return []; }
}

function loadPack(packName) {
    const p = path.join(__dirname, 'data', 'packs', packName);
    if (!fs.existsSync(p)) return console.error("❌ Пак не знайдено:", p);
    
    const cfgPath = path.join(p, 'config.json');
    if (fs.existsSync(cfgPath)) DB.config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    
    DB.professions = parseCSV(path.join(p, 'professions.csv'));
    DB.hobbies = parseCSV(path.join(p, 'hobbies.csv'));
    DB.health = parseCSV(path.join(p, 'health.csv'));
    DB.fears = parseCSV(path.join(p, 'fears.csv'));
    DB.facts = parseCSV(path.join(p, 'facts.csv'));
    DB.disasters = parseCSV(path.join(p, 'disasters.csv'));
    DB.bunkers = parseCSV(path.join(p, 'bunkers.csv'));
    DB.cards = parseCSV(path.join(p, 'cards.csv'));
    
    const allItems = parseCSV(path.join(p, 'items.csv'));
    if(allItems.length > 0) {
        DB.items_small = allItems.filter(i => i.type === 'small');
        DB.items_big = allItems.filter(i => i.type === 'big');
    }
    console.log(`✅ Пак завантажено! Професій: ${DB.professions.length}`);
}

loadPack('classic_ua');

// --- 2. ГЕНЕРАТОР ---
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getRandomItem(arr) { 
    if (!arr || arr.length === 0) return { name: "Нічого" };
    return arr[Math.floor(Math.random() * arr.length)]; 
}

function generatePlayer() {
    const cfg = DB.config;
    if (!cfg.age_limits) return {}; 

    const age = getRandomInt(cfg.age_limits.min, cfg.age_limits.max);
    
    // 🔥 ВАЖЛИВО: Отримуємо об'єкт професії
    const profBase = getRandomItem(DB.professions); 
    const maxExp = Math.max(0, age - 16);

    // Картки
    let c1 = getRandomItem(DB.cards);
    let c2 = getRandomItem(DB.cards);
    let safe = 0;
    while (c1.id === c2.id && DB.cards.length > 1 && safe < 10) {
        c2 = getRandomItem(DB.cards); safe++;
    }

    return {
        bio: { 
            age, 
            sex: Math.random() > 0.5 ? 'Чоловік' : 'Жінка',
            gender: getRandomItem(cfg.genders),
            height: getRandomInt(cfg.body_limits.height_min, cfg.body_limits.height_max),
            weight: getRandomInt(cfg.body_limits.weight_min, cfg.body_limits.weight_max)
        },
        profession: { 
            id: profBase.id, // 👈 ОСЬ ЦЕ НАЙВАЖЛИВІШЕ! Без ID сервер не знає, що робити.
            name: profBase.name, 
            experience: `${getRandomInt(0, maxExp)} років`, 
            ability: profBase.ability 
        },
        health: { name: getRandomItem(DB.health).name, stage: "" },
        fear: getRandomItem(DB.fears).name,
        hobby: getRandomItem(DB.hobbies),
        baggage: { small: getRandomItem(DB.items_small).name, big: getRandomItem(DB.items_big).name },
        cards: [c1, c2],
        fact: getRandomItem(DB.facts).text
    };
}

// --- 3. ЛОГІКА СЕРВЕРА ---
const ROOMS = {}; 

io.on('connection', (socket) => {
    
    // ВХІД
    socket.on('join_room', ({ name, roomCode }) => {
        roomCode = roomCode.toUpperCase();
        socket.join(roomCode);
        if (!ROOMS[roomCode]) ROOMS[roomCode] = { players: [], started: false, hostId: socket.id, gameData: {} };
        
        const player = { 
            id: socket.id, 
            name: name, 
            isHost: (ROOMS[roomCode].hostId === socket.id),
            character: null,
            usedCardIds: [],
            professionUsed: false
        };
        ROOMS[roomCode].players.push(player);
        io.to(roomCode).emit('update_players', ROOMS[roomCode].players);
    });

    // СТАРТ
    socket.on('start_game', (roomCode) => {
        const room = ROOMS[roomCode];
        if (room) {
            room.started = true;
            
            // Генерація світу
            const playersCount = room.players.length;
            const placesCount = Math.ceil(playersCount / 2) + 1;
            let disaster = { ...getRandomItem(DB.disasters) };
            let bunker = { ...getRandomItem(DB.bunkers) };
            
            // Заміна змінних
            const vars = {
                '{places}': placesCount, '{alive}': getRandomInt(1, 15),
                '{infected}': getRandomInt(80, 99), '{years}': getRandomInt(5, 50),
                '{months}': getRandomInt(2, 24), '{days}': getRandomInt(10, 100),
                '{rad}': getRandomInt(50, 500)
            };
            const formatText = (text) => {
                let newText = text || "";
                for (const [key, value] of Object.entries(vars)) {
                    if(newText.includes(key)) newText = newText.replaceAll(key, value);
                }
                return newText;
            };
            disaster.description = formatText(disaster.description); disaster.residue = formatText(disaster.residue); disaster.time = formatText(disaster.time);
            bunker.description = formatText(bunker.description); bunker.supplies = formatText(bunker.supplies);

            room.gameData = { disaster, bunker, places: placesCount, total_players: playersCount };

            // Генеруємо гравців
            room.players.forEach(p => {
                p.character = generatePlayer();
                p.usedCardIds = []; 
                p.professionUsed = false;
            });
            
            sendGameState(roomCode);
        }
    });

    // --- КАРТКИ ---
    socket.on('use_card', ({ roomCode, cardId, targetId }) => {
        const room = ROOMS[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        const cardObj = DB.cards.find(c => c.id === cardId);
        
        if (cardObj) {
            if (!player.usedCardIds.includes(cardId)) player.usedCardIds.push(cardId);
            const resultMsg = CardEngine.processCardEffect(room, player, cardObj, DB, targetId);
            sendGameState(roomCode);
            io.to(roomCode).emit('notification', `🃏 ${player.name}: ${cardObj.name}. ${resultMsg}`);
        }
    });

    // --- ПРОФЕСІЇ (Виправлена логіка) ---
    socket.on('use_profession', ({ roomCode, targetId }) => {
        console.log(`🛠 Отримано запит use_profession від ${socket.id}`);
        
        const room = ROOMS[roomCode];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.professionUsed) {
             console.log("❌ Гравець вже використав професію або не знайдений");
             return;
        }

        // Знаходимо професію в базі по ID, який зберіг генератор
        const profId = player.character.profession.id;
        console.log(`🔍 ID професії гравця: ${profId}`);

        const profData = DB.professions.find(p => p.id === profId);

        if (profData && profData.effect) {
            console.log(`✅ Професія знайдена в базі: ${profData.name}`);
            player.professionUsed = true;
            
            // Запускаємо Engine
            const resultMsg = CardEngine.processCardEffect(room, player, profData, DB, targetId);

            sendGameState(roomCode);
            io.to(roomCode).emit('notification', `🛠 ${player.name} використав професію '${profData.name}'! ${resultMsg}`);
        } else {
            console.log("❌ Професію не знайдено в DB або вона не має ефекту");
            socket.emit('notification', "Ця професія не має активної дії.");
        }
    });
    
    socket.on('disconnect', () => { /* ... видалення гравця ... */ });
});

function sendGameState(roomCode) {
    const room = ROOMS[roomCode];
    if(!room) return;
    room.players.forEach(p => {
        io.to(p.id).emit('game_started', {
            me: p.character,
            game: room.gameData,
            usedCards: p.usedCardIds,
            professionUsed: p.professionUsed
        });
    });
}

server.listen(3000, () => console.log('🚀 Server OK'));