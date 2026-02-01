/* modules/cardEngine.js */

function getRandomItem(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

module.exports = {
    processCardEffect: (room, actorPlayer, itemData, DB, targetId = null) => {
        console.log(`⚙️ ENGINE: ${itemData.name} (Target: ${itemData.target})`);
        
        let targets = [];

        // 1. ВИБІР ЦІЛІ
        if (itemData.target === 'ALL') {
            targets = room.players;
        } 
        else if (itemData.target === 'SELF') {
            // 🔥 ЯКЩО SELF - МИ ІГНОРУЄМО targetId З МОДАЛКИ І БЕРЕМО СЕБЕ
            targets = [actorPlayer];
        } 
        else if (itemData.target === 'SELECT_PLAYER') {
            if (targetId) {
                const specificTarget = room.players.find(p => p.id === targetId);
                if (specificTarget) targets = [specificTarget];
            } else {
                // Якщо не вибрали - беремо рандом
                targets = [getRandomItem(room.players)];
            }
        }
        else if (itemData.target === 'RANDOM_PLAYER') {
            targets = [getRandomItem(room.players)];
        }

        // 2. ЕФЕКТ
        let names = [];
        targets.forEach(t => {
            if(!t.character) return;
            names.push(t.name);

            if (itemData.effect === 'RANDOM') {
                applyRandomize(t.character, itemData.attribute, DB);
            } else if (itemData.effect === 'HEAL') {
                applyHeal(t.character, itemData.attribute, DB);
            }
        });

        return `Застосовано до: ${names.join(', ')}`;
    }
};

// Функції змін
function applyRandomize(char, attribute, DB) {
    if (attribute === 'profession') {
        const newItem = getRandomItem(DB.professions);
        const maxExp = Math.max(0, char.bio.age - 16);
        char.profession = {
            id: newItem.id, // ID ЗБЕРІГАЄТЬСЯ
            name: newItem.name,
            experience: `${getRandomInt(0, maxExp)} років`,
            ability: newItem.ability
        };
    } else if (attribute === 'health') {
        const newItem = getRandomItem(DB.health);
        char.health = { name: newItem.name, stage: "" };
    }
    // ... сюди можна дописати fear, hobby ...
}

function applyHeal(char, attribute, DB) {
    if (attribute === 'health') char.health = { name: "Ідеально здоровий", stage: "" };
    if (attribute === 'fear') char.fear = "Відсутня";
}