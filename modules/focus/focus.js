function initFocusModule() {
    // === 0. AUDIO SYSTEM (The Dopamine Hit) ===
    const Sfx = {
        beep: (freq = 600, type = 'sine', duration = 0.1) => {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
            osc.stop(ctx.currentTime + duration);
        },
        success: () => { Sfx.beep(800, 'triangle', 0.1); setTimeout(() => Sfx.beep(1200, 'sine', 0.3), 100); },
        coin: () => { Sfx.beep(1500, 'square', 0.05); setTimeout(() => Sfx.beep(2000, 'square', 0.05), 50); },
        levelUp: () => {
            Sfx.beep(400, 'sine', 0.2);
            setTimeout(() => Sfx.beep(600, 'sine', 0.2), 200);
            setTimeout(() => Sfx.beep(1000, 'triangle', 0.6), 400);
        }
    };

    // === 1. FOCUS STORE (Data Layer) ===
    const DB_KEY = 'focus_v2_data';

    const defaultData = {
        player: {
            xp: 0, level: 1, hp: 100, maxHp: 100, gold: 0, streak: 0,
            lastLogin: new Date().toISOString()
        },
        inventory: { themes: ['default'], activeTheme: 'default', shields: 0 },
        biomes: {
            forge: { id: 'forge', name: 'Iron Forge', desc: 'Business & Code', lastActive: Date.now() },
            garage: { id: 'garage', name: 'The Garage', desc: 'Hobbies & Fun', lastActive: Date.now() },
            barracks: { id: 'barracks', name: 'Barracks', desc: 'Health & Home', lastActive: Date.now() },
            treasury: { id: 'treasury', name: 'Treasury', desc: 'Admin & Finance', lastActive: Date.now() }
        },
        inbox: [],
        tasks: [],
        protocol: [
            { id: 'p1', title: 'Take Meds', done: false },
            { id: 'p2', title: 'Hydrate', done: false },
            { id: 'p3', title: 'Check Calendar', done: false }
        ]
    };

    let state = loadState();

    function loadState() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return defaultData;
        try {
            const data = JSON.parse(raw);
            if (!data.inventory) data.inventory = defaultData.inventory;
            if (!data.protocol) data.protocol = defaultData.protocol;
            if (!data.inbox) data.inbox = [];
            return data;
        } catch (e) {
            console.error("Save file corrupted. Resetting.");
            return defaultData;
        }
    }

    function saveState() {
        localStorage.setItem(DB_KEY, JSON.stringify(state));
        // We must call UI.render(), and check if UI exists yet to be safe
        if (typeof UI !== 'undefined') {
            UI.render();
        }
    }

    // === 2. GAME ENGINE ===
    // === 2. GAME ENGINE (Upgraded Rewards) ===
    const Engine = {
        checkDailyReset: () => {
            const last = new Date(state.player.lastLogin);
            const now = new Date();
            const isSameDay = last.getDate() === now.getDate() && last.getMonth() === now.getMonth();

            if (!isSameDay) {
                const missedProtocols = state.protocol.filter(p => !p.done).length;
                if (missedProtocols > 0) {
                    Engine.takeDamage(missedProtocols * 10);
                    alert(`⚠️ DAY RESET: You missed ${missedProtocols} protocols. Took ${missedProtocols * 10} DMG.`);
                } else {
                    state.player.streak++;
                    state.player.gold += 20;
                }
                state.protocol.forEach(p => p.done = false);
                state.player.lastLogin = now.toISOString();
                saveState();
            }
        },

        takeDamage: (amount) => {
            state.player.hp -= amount;
            if (state.player.hp <= 0) {
                state.player.hp = 100;
                state.player.level = Math.max(1, state.player.level - 1);
                state.player.streak = 0;
                alert("☠️ CRITICAL FAILURE. Level Lost. Streak Reset.");
            }
            saveState();
        },

        addItemToInbox: (text) => {
            state.inbox.unshift({ id: Date.now(), title: text, created: Date.now() });
            saveState();
            UI.render();
        },

        completeTask: (taskId) => {
            const task = state.tasks.find(t => t.id === taskId);
            if (!task) return;

            // --- DYNAMIC REWARD LOGIC ---
            // easy: 10xp/5g | medium: 25xp/15g | hard: 60xp/40g
            const rewards = {
                easy: { xp: 10, gold: 5 },
                medium: { xp: 25, gold: 15 },
                hard: { xp: 60, gold: 40 }
            };

            const difficulty = task.difficulty || 'medium'; // Default to medium if missing
            const base = rewards[difficulty];

            // Mission Bonus: 1.5x Multiplier
            const multiplier = task.type === 'mission' ? 1.5 : 1.0;

            const finalXp = Math.floor(base.xp * multiplier);
            const finalGold = Math.floor(base.gold * multiplier);

            state.player.xp += finalXp;
            state.player.gold += finalGold;
            // -----------------------------

            if (state.biomes[task.biome]) {
                state.biomes[task.biome].lastActive = Date.now();
            }

            if (state.player.xp >= state.player.level * 100) {
                state.player.level++;
                state.player.xp = 0;
                state.player.hp = state.player.maxHp;
                alert("⭐ PROMOTION! Level Up! Health Restored.");
            }

            // Show a floating text or alert for the reward
            alert(`✅ COMPLETE! +${finalXp} XP | +${finalGold} Gold`);

            state.tasks = state.tasks.filter(t => t.id !== taskId);
            saveState();
        },

        deleteInboxItem: (id) => {
            state.inbox = state.inbox.filter(i => i.id !== id);
            saveState();
        },

        getRustLevel: (biomeId) => {
            const last = state.biomes[biomeId].lastActive || 0;
            const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
            if (daysSince > 7) return 2;
            if (daysSince > 3) return 1;
            return 0;
        }
    };

    // === 3. SMART PARSER (Upgraded Intelligence) ===
    const Parser = {
        parseAndExecute: (text) => {
            // 1. SECRET RESET COMMAND
            if (text.trim().toUpperCase() === 'RESET GAME') {
                if (confirm("⚠️ WARNING: This will wipe all progress. Are you sure?")) {
                    localStorage.removeItem(DB_KEY);
                    location.reload();
                    return "SYSTEM RESETTING...";
                }
                return "Reset Cancelled.";
            }

            // 2. JSON Parsing
            try {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("No JSON found.");
                const data = JSON.parse(jsonMatch[0]);
                if (data.newTasks) {
                    data.newTasks.forEach(t => {
                        state.tasks.push({
                            id: Date.now() + Math.random(),
                            title: t.title,
                            biome: t.biome.toLowerCase(),
                            type: t.type || 'side',
                            difficulty: t.difficulty || 'medium', // SAVE DIFFICULTY
                            dueDate: t.dueDate || null,
                            created: Date.now()
                        });
                    });
                    if (data.newTasks.length > 0) state.inbox = [];
                }
                saveState();
                return `Sir! Added ${data.newTasks ? data.newTasks.length : 0} orders.`;
            } catch (e) {
                console.error(e);
                return "Parsing Error. Ensure JSON format.";
            }
        },
        getBriefing: () => {
            // UPDATED PROMPT: Tells AI to assign difficulty
            return `SYSTEM_ROLE: You are "The Sergeant".
STATUS: Level ${state.player.level}, HP ${state.player.hp}, Gold ${state.player.gold}.
UNSORTED INBOX: ${JSON.stringify(state.inbox)}
EXISTING TASKS: ${JSON.stringify(state.tasks)}

INSTRUCTIONS: 
1. Convert Inbox items into clear tasks.
2. Assign biome: 'forge' (work), 'garage' (fun), 'barracks' (life), 'treasury' (admin).
3. Assign difficulty: 'easy' (5 mins), 'medium' (30 mins), 'hard' (1 hour+).

OUTPUT JSON ONLY: 
{ "newTasks": [{ "title": "...", "biome": "...", "difficulty": "easy/medium/hard", "type": "side" }] }`;
        }
    };
    // === 4. UI RENDERER ===
    const UI = {
        els: {
            hp: document.getElementById('hud-hp-bar'),
            xp: document.getElementById('hud-xp-bar'),
            lvl: document.getElementById('hud-level'),
            gold: document.getElementById('hud-gold'),
            streak: document.getElementById('hud-streak'),
            protocol: document.getElementById('protocol-list'),
            biomes: document.getElementById('biome-grid'),
            missions: document.getElementById('mission-list'),
            inbox: document.getElementById('inbox-list'),
            inboxSection: document.getElementById('inbox-section'),
            input: document.getElementById('focus-quick-add'),
            addBtn: document.getElementById('focus-add-btn'),
            armory: document.getElementById('armory-grid')
        },

        closeModals: () => {
            document.querySelectorAll('.focus-modal').forEach(m => m.classList.add('is-hidden'));
        },

        openModal: (id) => {
            UI.closeModals();
            const m = document.getElementById(id);
            if (m) {
                m.classList.remove('is-hidden');
                if (id === 'modal-armory') UI.renderShop();
            }
        },

        // --- CRASH PROOF LISTENER ATTACHMENT ---
        // --- CRASH PROOF LISTENER ATTACHMENT ---
        initListeners: () => {
            // Helper function to safely attach clicks to buttons
            const bind = (id, fn) => {
                const el = document.getElementById(id);
                if (el) el.onclick = fn;
            };

            // 1. FIX FOR ENTER KEY (Listens to the whole page)
            document.addEventListener('keydown', (e) => {
                // If the user pressed ENTER while inside the "focus-quick-add" box
                if (e.target && e.target.id === 'focus-quick-add' && e.key === 'Enter') {
                    const input = e.target;
                    const val = input.value.trim();
                    if (val) {
                        Engine.addItemToInbox(val);
                        input.value = ''; // Clear the box
                    }
                }
            });

            // 2. Button Listeners
            bind('btn-open-armory', () => UI.openModal('modal-armory'));
            bind('btn-open-console', () => UI.openModal('modal-console'));

            // 3. Quick Add Button (Click version)
            bind('focus-add-btn', () => {
                const input = document.getElementById('focus-quick-add');
                if (input) {
                    const val = input.value.trim();
                    if (val) {
                        Engine.addItemToInbox(val);
                        input.value = '';
                    }
                }
            });

            // 4. Console Actions
            bind('btn-copy-brief', () => {
                navigator.clipboard.writeText(Parser.getBriefing());
                alert("Briefing Copied!");
            });
            bind('btn-run-parse', () => {
                const area = document.getElementById('console-input');
                if (area) {
                    const res = Parser.parseAndExecute(area.value);
                    alert(res);
                    UI.closeModals();
                }
            });

            // 5. Tactical Menu
            bind('btn-tactical-refresh', () => {
                const title = document.getElementById('tactical-biome-title');
                if (title) UI.showTacticalMenu(title.dataset.id);
            });
            bind('btn-tactical-add', () => {
                const title = document.getElementById('tactical-biome-title');
                if (title) {
                    const t = prompt("New Task Name:");
                    if (t) {
                        state.tasks.push({ id: Date.now(), title: t, biome: title.dataset.id, type: 'side', created: Date.now() });
                        saveState();
                        UI.showTacticalMenu(title.dataset.id);
                    }
                }
            });

            // 6. Close Modal Buttons
            document.querySelectorAll('.close-modal-btn').forEach(b => {
                b.onclick = (e) => { e.stopPropagation(); UI.closeModals(); };
            });
            document.querySelectorAll('.focus-modal').forEach(m => {
                m.onclick = (e) => { if (e.target === m) UI.closeModals(); };
            });
        },
        showTacticalMenu: (biomeId) => {
            if (!state.biomes[biomeId]) return;
            const biome = state.biomes[biomeId];
            const titleEl = document.getElementById('tactical-biome-title');
            if (titleEl) {
                titleEl.textContent = `DEPLOYMENT: ${biome.name.toUpperCase()}`;
                titleEl.dataset.id = biomeId;
            }

            const tasks = state.tasks.filter(t => t.biome === biomeId);
            const container = document.getElementById('tactical-options');
            if (container) {
                container.innerHTML = '';
                if (tasks.length === 0) {
                    container.innerHTML = `<div style="padding:20px; text-align:center; opacity:0.6;">Sector Clear. No tasks.</div>`;
                } else {
                    const picks = tasks.sort(() => 0.5 - Math.random()).slice(0, 3);
                    picks.forEach(task => {
                        const btn = document.createElement('button');
                        btn.className = 'tactical-btn';

                        // Visual Difficulty Indicators
                        let stars = '⭐';
                        if (task.difficulty === 'medium') stars = '⭐⭐';
                        if (task.difficulty === 'hard') stars = '⭐⭐⭐';

                        btn.innerHTML = `
                            <div style="display:flex; justify-content:space-between;">
                                <span>${task.title}</span>
                                <span>${stars}</span>
                            </div>
                            <small style="opacity:0.7;">${task.type.toUpperCase()} | ${task.difficulty.toUpperCase()}</small>
                        `;

                        btn.onclick = () => {
                            if (confirm(`Execute ${task.difficulty} mission?`)) {
                                Engine.completeTask(task.id);
                                UI.closeModals();
                            }
                        };
                        container.appendChild(btn);
                    });
                }
            }
            UI.openModal('modal-tactical');
        },

        renderShop: () => {
            const items = [
                { id: 'potion', name: 'Health Potion', cost: 50, icon: '❤️', type: 'consumable', desc: 'Restores 50 HP' },
                { id: 'shield', name: 'Streak Shield', cost: 100, icon: '🛡️', type: 'consumable', desc: 'Protects streak for 1 day' },
                { id: 'theme-cyberpunk', name: 'Theme: Cyberpunk', cost: 500, icon: '💾', type: 'theme', desc: 'Neon Green & Black' },
                { id: 'theme-paper', name: 'Theme: Paper', cost: 500, icon: '📝', type: 'theme', desc: 'High Contrast White' }
            ];

            const grid = document.getElementById('armory-grid');
            if (grid) {
                grid.innerHTML = '';
                items.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'shop-item';

                    // Check if owned
                    const isOwned = item.type === 'theme' && state.inventory.themes.includes(item.id.replace('theme-', ''));

                    if (isOwned) {
                        div.classList.add('owned');
                        div.innerHTML = `<div style="font-size:2rem;">${item.icon}</div><strong>${item.name}</strong><br><span style="color:#555;">OWNED</span>`;
                    } else {
                        div.innerHTML = `<div style="font-size:2rem;">${item.icon}</div><strong>${item.name}</strong><br><small>${item.desc}</small><br><span style="color:gold; font-weight:bold;">${item.cost} G</span>`;

                        div.onclick = () => {
                            if (state.player.gold >= item.cost) {
                                if (confirm(`Buy ${item.name} for ${item.cost} Gold?`)) {
                                    state.player.gold -= item.cost;

                                    if (item.type === 'theme') {
                                        const themeName = item.id.replace('theme-', '');
                                        state.inventory.themes.push(themeName);
                                        state.inventory.activeTheme = themeName;
                                        UI.applyTheme(themeName); // <--- INSTANTLY APPLY THEME
                                        alert("🎨 SYSTEM UPDATE: New Visuals Installed.");
                                    } else if (item.id === 'potion') {
                                        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 50);
                                        alert("❤️ HEALTH RESTORED. Systems Optimal.");
                                    } else if (item.id === 'shield') {
                                        state.inventory.shields++;
                                        alert("🛡️ SHIELD ACTIVE. Next missed day ignored.");
                                    }

                                    saveState();
                                    // UI.render() is called inside saveState now!
                                }
                            } else {
                                alert("❌ INSUFFICIENT FUNDS. Complete more tasks.");
                            }
                        };
                    }
                    grid.appendChild(div);
                });
            }
        },

        applyTheme: (theme) => {
            document.body.className = '';
            if (theme !== 'default') document.body.classList.add(`theme-${theme}`);
        },

        render: () => {
            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setTxt('hud-level', state.player.level);
            setTxt('hud-gold', state.player.gold);
            setTxt('hud-streak', state.player.streak);

            // --- RENDER BUFFS (The Shield!) ---
            const buffContainer = document.getElementById('hud-buffs');
            if (buffContainer) {
                buffContainer.innerHTML = '';

                // 1. Shield Buff
                if (state.inventory.shields > 0) {
                    const div = document.createElement('div');
                    div.className = 'buff-item';
                    div.title = "Streak Shield Active (Protects against 1 missed day)";
                    div.innerHTML = `🛡️ <span class="buff-count">${state.inventory.shields}</span>`;
                    buffContainer.appendChild(div);
                }

                // 2. Streak Fire (Visual only if streak > 3)
                if (state.player.streak > 3) {
                    const div = document.createElement('div');
                    div.className = 'buff-item';
                    div.title = "On Fire! (High Streak)";
                    div.style.borderColor = '#ff9800'; // Orange border
                    div.style.boxShadow = '0 0 10px #ff9800';
                    div.innerHTML = `🔥`;
                    buffContainer.appendChild(div);
                }
            }

            const hpBar = document.getElementById('hud-hp-bar');
            if (hpBar) hpBar.style.width = `${(state.player.hp / state.player.maxHp) * 100}%`;

            const xpBar = document.getElementById('hud-xp-bar');
            if (xpBar) xpBar.style.width = `${(state.player.xp / (state.player.level * 100)) * 100}%`;

            const inboxList = document.getElementById('inbox-list');
            const inboxSec = document.getElementById('inbox-section');
            if (inboxList && inboxSec) {
                inboxList.innerHTML = '';
                if (state.inbox.length > 0) {
                    inboxSec.classList.remove('is-hidden');
                    state.inbox.forEach(i => {
                        const div = document.createElement('div');
                        div.className = 'inbox-item';
                        div.innerHTML = `<span>${i.title}</span><button onclick="window.delInbox(${i.id})" style="border:none;background:none;color:#555;">x</button>`;
                        inboxList.appendChild(div);
                    });
                } else { inboxSec.classList.add('is-hidden'); }
            }

            const protoList = document.getElementById('protocol-list');
            if (protoList) {
                protoList.innerHTML = '';
                state.protocol.forEach((p) => {
                    const div = document.createElement('div');
                    div.className = `protocol-card ${p.done ? 'done' : ''}`;
                    div.textContent = p.title;
                    div.onclick = () => { p.done = !p.done; saveState(); };
                    protoList.appendChild(div);
                });
            }

            const biomeGrid = document.getElementById('biome-grid');
            if (biomeGrid) {
                biomeGrid.innerHTML = '';
                Object.values(state.biomes).forEach(b => {
                    const taskCount = state.tasks.filter(t => t.biome === b.id).length;
                    const rust = Engine.getRustLevel(b.id);
                    const div = document.createElement('div');
                    div.className = `biome-card rust-${rust}`;
                    div.innerHTML = `<div class="biome-header"><span>${b.name}</span><span class="biome-count">${taskCount}</span></div><div class="biome-desc">${b.desc}</div>`;
                    div.onclick = () => UI.showTacticalMenu(b.id);
                    biomeGrid.appendChild(div);
                });
            }

            const missionList = document.getElementById('mission-list');
            if (missionList) {
                missionList.innerHTML = '';
                const deadlines = state.tasks.filter(t => t.type === 'mission').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
                if (deadlines.length === 0) {
                    missionList.innerHTML = '<div class="empty-state">No active deadlines. Sector clear.</div>';
                } else {
                    deadlines.forEach(t => {
                        const daysLeft = Math.ceil((new Date(t.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                        const div = document.createElement('div');
                        div.className = `mission-item ${daysLeft < 0 ? 'overdue' : ''}`;
                        div.innerHTML = `<div><strong>${t.title}</strong><br><small>${daysLeft < 0 ? 'OVERDUE' : daysLeft + ' days left'}</small></div><button class="hud-btn" onclick="window.finishTask(${t.id})">✅</button>`;
                        missionList.appendChild(div);
                    });
                }
            }
            UI.applyTheme(state.inventory.activeTheme);
        }
    };

    window.finishTask = (id) => Engine.completeTask(id);
    window.delInbox = (id) => Engine.deleteInboxItem(id);

    // Wait 100ms to ensure the HTML is ready before running
    setTimeout(() => {
        Engine.checkDailyReset();
        UI.initListeners();
        UI.render();
    }, 100);
}