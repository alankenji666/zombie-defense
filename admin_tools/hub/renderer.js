let ipcRenderer;
try {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
} catch (e) {
    console.error("ERRO: Não foi possível carregar o ipcRenderer.", e);
}

let currentTab = 'dashboard';
let serverStatus = 'offline';
let refreshInterval = null;
let tabRefreshInterval = null;
let logCount = 0;

let allMobs = [];
let allItems = [];
let allCategories = [];
let allPlayers = [];
let currentEditingSlotIndex = -1;
let currentItemCategory = 'all';

// --- OPEN GAME IN BROWSER ---
function openGameBrowser() {
    ipcRenderer.send('open-game-browser');
    addLog('[ADMIN] Abrindo jogo no navegador...');
}

function openRenderDashboard() {
    ipcRenderer.send('open-render-dashboard');
    addLog('[ADMIN] Abrindo Dashboard do Render...');
}

function openMapEditor() {
    // Abrir via IPC nativo do Electron (independente do servidor online/offline)
    ipcRenderer.send('open-map-editor');
    addLog('[ADMIN] Abrindo Editor de Mapa 3D...');
}

// --- TAB NAVIGATION ---
function showTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById('tab-' + tabId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        if(btn.innerText.toLowerCase().includes(tabId)) btn.classList.add('active');
    });

    // Para o polling do dashboard e o auto-refresh de outras abas
    stopDashboardPolling();
    stopTabRefresh();

    if(tabId === 'dashboard') {
        startDashboardPolling();
    } else if(tabId === 'mobs') {
        loadMobs();
        if (serverStatus === 'online') startTabRefresh(() => loadMobs());
    } else if(tabId === 'items') {
        loadItems();
        if (serverStatus === 'online') startTabRefresh(() => loadItems());
    } else if(tabId === 'players') {
        loadAllPlayers();
        if (serverStatus === 'online') startTabRefresh(() => loadAllPlayers());
    } else if(tabId === 'config') {
        loadServerConfig();
    }
}

// --- SERVER CONTROL ---
function startServer() {
    ipcRenderer.send('server-start');
    addLog("[ADMIN] Iniciando servidor...");
}

function stopServer() {
    ipcRenderer.send('server-stop');
    addLog("[ADMIN] Parando servidor...");
}

function restartServer() {
    ipcRenderer.send('server-restart');
    addLog("[ADMIN] Reiniciando servidor...");
}

ipcRenderer.on('server-status', (event, status) => {
    serverStatus = status;
    const pill = document.getElementById('server-status-pill');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnRestart = document.getElementById('btnRestart');

    if (status === 'online') {
        pill.className = 'status-pill online';
        pill.innerHTML = '<span class="dot"></span> STATUS: ONLINE';
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
        btnRestart.classList.remove('hidden');
        startDashboardPolling();
        addLog("[SISTEMA] ✅ Servidor conectado e online.");
    } else {
        pill.className = 'status-pill offline';
        pill.innerHTML = '<span class="dot"></span> STATUS: OFFLINE';
        btnStart.classList.remove('hidden');
        btnStop.classList.add('hidden');
        btnRestart.classList.add('hidden');
        stopDashboardPolling();
        stopTabRefresh(); // Para o refresh das abas quando servidor cair
        addLog("[SISTEMA] 🔴 Servidor desligado.");
    }
});

function addLog(msg) {
    // Adiciona no console do dashboard (aba de Logs separada)
    const consoleFull = document.getElementById('server-console-full');
    if (consoleFull) {
        // Remove placeholder se existir
        const placeholder = consoleFull.querySelector('.log-placeholder');
        if (placeholder) placeholder.remove();

        const entry = document.createElement('span');
        const time = new Date().toLocaleTimeString();
        entry.innerText = `[${time}] ${msg}`;
        consoleFull.appendChild(entry);
        consoleFull.scrollTop = consoleFull.scrollHeight;

        logCount++;
        const countEl = document.getElementById('log-count');
        if(countEl) countEl.innerText = `${logCount} entradas`;
    }
}

function clearLogs() {
    const consoleFull = document.getElementById('server-console-full');
    if (consoleFull) {
        consoleFull.innerHTML = '<span class="log-placeholder">Logs limpos.</span>';
        logCount = 0;
        const countEl = document.getElementById('log-count');
        if(countEl) countEl.innerText = '0 entradas';
    }
}



// --- DASHBOARD POLLING ---
function startDashboardPolling() {
    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(updateDashboard, 3000);
    updateDashboard();
}

function stopDashboardPolling() {
    if(refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
}

// --- AUTO-REFRESH DE ABAS (Players / Mobs / Items) ---
function startTabRefresh(callback, intervalMs = 5000) {
    if(tabRefreshInterval) clearInterval(tabRefreshInterval);
    tabRefreshInterval = setInterval(() => {
        if(serverStatus === 'online') callback();
    }, intervalMs);
}

function stopTabRefresh() {
    if(tabRefreshInterval) clearInterval(tabRefreshInterval);
    tabRefreshInterval = null;
}

// Ouve o evento socket admin_dashboard_update (emitido pelo server a cada 1s)
// para atualizar o dashboard em tempo real sem precisar de polling HTTP extra
ipcRenderer.on('admin_dashboard_update', (event, data) => {
    document.getElementById('val-players').innerText = data.playersCount ?? 0;
    document.getElementById('val-animals').innerText = data.animalsCount ?? 0;
    const ram = data.ramUsage ?? data.ramUsed ?? 0;
    document.getElementById('val-ram').innerText = `${ram} MB`;
    renderSurvivors(data.onlinePlayers || data.playersList || {});
});

ipcRenderer.on('server-log', (event, msg) => {
    // O server emite via socket.io para os browsers, mas o Electron
    // tambem redireciona stdout como 'server-log'. Capturamos os dois.
    const clean = msg.trim();
    if(clean) addLog(`[SERVER] ${clean}`);
});

async function updateDashboard() {
    if(serverStatus !== 'online') return;
    try {
        const response = await fetch('http://localhost:3000/api/status');
        const data = await response.json();
        document.getElementById('val-players').innerText = data.playersCount ?? 0;
        document.getElementById('val-animals').innerText = data.animalsCount ?? 0;
        // Fix: o campo correto é ramUsage
        const ram = data.ramUsage ?? data.ramUsed ?? 0;
        document.getElementById('val-ram').innerText = `${ram} MB`;
        renderSurvivors(data.onlinePlayers || data.playersList || {});
    } catch (e) {}
}

function renderSurvivors(players) {
    const tbody = document.getElementById('active-survivors-body');
    let html = "";
    // Suporta tanto objeto quanto array
    const playerArray = Array.isArray(players) ? players : Object.values(players);
    if(playerArray.length === 0) {
        html = '<tr><td colspan="6" class="placeholder">Nenhum sobrevivente ativo na ilha.</td></tr>';
    } else {
        playerArray.forEach(p => {
            html += `<tr>
                <td style="color:#fff; font-weight:bold;">${p.name || '---'}</td>
                <td>${p.level ?? 1}</td>
                <td>${p.xp ?? 0}</td>
                <td style="color:#ff5e5e">${p.hp ?? 100}</td>
                <td style="color:#ffb84d">${p.hunger ?? 100}</td>
                <td style="color:#00bcd4">(${p.x ?? 0}, ${p.y ?? 0})</td>
            </tr>`;
        });
    }
    tbody.innerHTML = html;
}

// --- MOBS MANAGER ---
async function loadMobs() {
    let data;
    if (serverStatus === 'online') {
        const resp = await fetch('http://localhost:3000/api/mobs');
        data = await resp.json();
    } else {
        // Modo Standalone via IPC
        data = await ipcRenderer.invoke('data-load-mobs');
    }
    allMobs = data.animals;
    renderMobSidebar();
}

function renderMobSidebar() {
    const list = document.getElementById('mob-list');
    let html = "";
    allMobs.forEach(m => {
        html += `<div class="sidebar-item" onclick="selectMob('${m.id}')">
            <span>${m.emoji}</span>
            <span>${m.name}</span>
        </div>`;
    });
    list.innerHTML = html;
}

function selectMob(id) {
    const mob = allMobs.find(m => m.id === id);
    if(!mob) return;
    document.getElementById('edit-mob-id').value = mob.id;
    document.getElementById('edit-mob-name').value = mob.name;
    document.getElementById('edit-mob-hp').value = mob.hp ?? 0;
    document.getElementById('edit-mob-xp').value = mob.xp ?? 0;
    document.getElementById('edit-mob-food').value = mob.food ?? mob.foodValue ?? 0;
    document.getElementById('edit-mob-collision').checked = mob.hasCollision ?? true;
    document.getElementById('edit-mob-emoji').innerText = mob.emoji;
    document.getElementById('edit-mob-header').innerText = mob.name;
    document.getElementById('mob-editor').style.display = 'flex';

    // Highlight selected
    document.querySelectorAll('#mob-list .sidebar-item').forEach(el => el.classList.remove('active'));
    event.currentTarget && event.currentTarget.classList.add('active');

    renderLootSlots(mob);
}

function renderLootSlots(mob) {
    const container = document.getElementById('loot-slots-container');
    let html = "";
    for(let i=0; i<8; i++) {
        const drop = (mob.drops && mob.drops[i]) ? mob.drops[i] : null;
        html += `<div class="loot-box" onclick="openDropEditor(${i})">`;
        if(drop) {
            const item = allItems.find(it => it.id === drop.itemId);
            html += `<span class="item-emoji">${item ? item.emoji : '❓'}</span>`;
            html += `<span class="item-info">${drop.chance}% Chance</span>`;
            html += `<span style="font-size:9px; color:#aaa;">${item ? item.name : drop.itemId}</span>`;
        } else {
            html += `<span class="vazio-icon">+</span><span class="vazio-text">Vazio</span>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;
}

async function saveMobDetail() {
    const id = document.getElementById('edit-mob-id').value;
    const mob = allMobs.find(m => m.id === id);
    mob.name = document.getElementById('edit-mob-name').value;
    mob.hp = parseInt(document.getElementById('edit-mob-hp').value) || 0;
    mob.xp = parseInt(document.getElementById('edit-mob-xp').value) || 0;
    mob.food = parseInt(document.getElementById('edit-mob-food').value) || 0;
    mob.hasCollision = document.getElementById('edit-mob-collision').checked;
    
    const btn = document.querySelector('#tab-mobs .btn-save');
    btn.innerText = '⏳ Salvando...';
    btn.disabled = true;

    if (serverStatus === 'online') {
        await fetch('http://localhost:3000/api/mobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ animals: allMobs })
        });
    } else {
        await ipcRenderer.invoke('data-save-mobs', { animals: allMobs });
    }

    btn.innerHTML = '<span class="btn-save-icon">✅</span> Salvo!';
    setTimeout(() => {
        btn.innerHTML = '<span class="btn-save-icon">💾</span> Salvar Alterações';
        btn.disabled = false;
    }, 2000);

    addLog(`[SERVER] Mob '${mob.name}' atualizado.`);
    loadMobs();
}

// --- ITEMS MANAGER ---
async function loadItems() {
    let data;
    if (serverStatus === 'online') {
        const resp = await fetch('http://localhost:3000/api/items');
        data = await resp.json();
    } else {
        data = await ipcRenderer.invoke('data-load-items');
    }
    allItems = data.items || [];
    allCategories = data.categories || [];
    renderCategoryFilters();
    renderItemSidebar();
}

function renderCategoryFilters() {
    const container = document.getElementById('item-category-filters');
    if (!container) return;
    let html = `<button class="cat-filter ${currentItemCategory === 'all' ? 'active' : ''}" data-cat="all" onclick="filterItemCategory('all')">&#128230; Todos (${allItems.length})</button>`;
    
    allCategories.forEach(cat => {
        const count = allItems.filter(i => i.category === cat.id).length;
        const isActive = currentItemCategory === cat.id;
        html += `<button class="cat-filter ${isActive ? 'active' : ''}" data-cat="${cat.id}" 
            style="${isActive ? `background:${cat.color}22; border-color:${cat.color}; color:${cat.color};` : ''}"
            onclick="filterItemCategory('${cat.id}')">
            ${cat.emoji} ${cat.name} (${count})
        </button>`;
    });
    container.innerHTML = html;
}

function filterItemCategory(catId) {
    currentItemCategory = catId;
    renderCategoryFilters();
    renderItemSidebar();
}

function filterItemSearch() {
    renderItemSidebar();
}

function getFilteredItems() {
    const searchTerm = document.getElementById('item-search-input')?.value.toLowerCase() || '';
    return allItems.filter(it => {
        const matchCat = currentItemCategory === 'all' || it.category === currentItemCategory;
        const matchSearch = !searchTerm || it.name.toLowerCase().includes(searchTerm) || it.id.toLowerCase().includes(searchTerm);
        return matchCat && matchSearch;
    });
}

function renderItemSidebar() {
    const list = document.getElementById('item-list');
    const filtered = getFilteredItems();
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="placeholder" style="padding:30px">Nenhum item encontrado.</div>';
        return;
    }

    let html = '';
    filtered.forEach(it => {
        const cat = allCategories.find(c => c.id === it.category);
        const catColor = cat ? cat.color : '#555';
        html += `<div class="sidebar-item" onclick="selectItem('${it.id}')">
            <span style="font-size:22px">${it.emoji}</span>
            <div style="flex:1">
                <div>${it.name}</div>
                <div style="font-size:10px; color:#555;">#${it.id}</div>
            </div>
            <span class="cat-dot" style="background:${catColor}" title="${cat ? cat.name : ''}"></span>
        </div>`;
    });
    list.innerHTML = html;
}

function selectItem(id) {
    const it = allItems.find(i => i.id === id);
    if (!it) return;

    document.getElementById('edit-item-id').value = it.id;
    document.getElementById('edit-item-id-badge').innerText = `ID: ${it.id}`;
    document.getElementById('edit-item-name').value = it.name;

    const hpVal = it.hpRestore ?? it.hp ?? 0;
    const hungerVal = it.hungerRestore ?? it.hunger ?? 0;

    document.getElementById('edit-item-hp').value = hpVal;
    document.getElementById('edit-item-hunger').value = hungerVal;
    document.getElementById('edit-item-weight').value = it.weight ?? 0;
    document.getElementById('edit-item-damage').value = it.damage ?? 0;
    document.getElementById('edit-item-defense').value = it.defense ?? 0;
    document.getElementById('edit-item-durability').value = it.durability ?? 0;
    document.getElementById('edit-item-emoji').innerText = it.emoji;
    document.getElementById('edit-item-header').innerText = it.name;
    document.getElementById('item-editor').style.display = 'flex';

    // Badge de categoria
    const cat = allCategories.find(c => c.id === it.category);
    const catBadge = document.getElementById('edit-item-cat-badge');
    if (catBadge && cat) {
        catBadge.innerText = `${cat.emoji} ${cat.name}`;
        catBadge.style.background = cat.color + '22';
        catBadge.style.borderColor = cat.color + '66';
        catBadge.style.color = cat.color;
    }

    // Descrição
    const descEl = document.getElementById('edit-item-description');
    if (descEl) descEl.innerText = it.description || 'Sem descrição.';

    // Highlight selected
    document.querySelectorAll('#item-list .sidebar-item').forEach(el => el.classList.remove('active'));

    updateItemPreview();
}

function updateItemPreview() {
    const hp = parseInt(document.getElementById('edit-item-hp').value) || 0;
    const hunger = parseInt(document.getElementById('edit-item-hunger').value) || 0;
    const damage = parseInt(document.getElementById('edit-item-damage')?.value) || 0;
    const defense = parseInt(document.getElementById('edit-item-defense')?.value) || 0;
    document.getElementById('preview-hp').innerText = `${hp} HP`;
    document.getElementById('preview-hunger').innerText = `${hunger} Fome`;
    if(document.getElementById('preview-damage')) document.getElementById('preview-damage').innerText = `${damage} Dano`;
    if(document.getElementById('preview-defense')) document.getElementById('preview-defense').innerText = `${defense} Def`;
}

// Listeners para atualizar preview ao digitar
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('edit-item-hp')?.addEventListener('input', updateItemPreview);
    document.getElementById('edit-item-hunger')?.addEventListener('input', updateItemPreview);
});

async function saveItemDetail() {
    const id = document.getElementById('edit-item-id').value;
    const it = allItems.find(i => i.id === id);
    if (!it) return;

    it.name = document.getElementById('edit-item-name').value;
    const hpVal = parseInt(document.getElementById('edit-item-hp').value) || 0;
    const hungerVal = parseInt(document.getElementById('edit-item-hunger').value) || 0;

    it.hp = hpVal;
    it.hpRestore = hpVal;
    it.hunger = hungerVal;
    it.hungerRestore = hungerVal;
    it.weight = document.getElementById('edit-item-weight').value;
    it.damage = parseInt(document.getElementById('edit-item-damage')?.value) || 0;
    it.defense = parseInt(document.getElementById('edit-item-defense')?.value) || 0;
    it.durability = parseInt(document.getElementById('edit-item-durability')?.value) || 0;

    const btn = document.querySelector('#tab-items .btn-save');
    btn.innerHTML = '⏳ Salvando...';
    btn.disabled = true;

    if (serverStatus === 'online') {
        await fetch('http://localhost:3000/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: allItems })
        });
    } else {
        await ipcRenderer.invoke('data-save-items', { items: allItems, categories: allCategories });
    }

    btn.innerHTML = '<span class="btn-save-icon">✅</span> Salvo no Catálogo!';
    setTimeout(() => {
        btn.innerHTML = '<span class="btn-save-icon">📖</span> Salvar no Catálogo';
        btn.disabled = false;
    }, 2000);

    addLog(`[SERVER] Item '${it.name}' (${it.id}) atualizado ${serverStatus === 'offline' ? '(Offline)' : ''}.`);
    loadItems();
}

// --- PLAYERS MANAGER ---
async function loadAllPlayers() {
    if (serverStatus === 'online') {
        const resp = await fetch('http://localhost:3000/api/players/all');
        allPlayers = await resp.json();
    } else {
        allPlayers = await ipcRenderer.invoke('data-load-players');
    }
    renderPlayersTable(allPlayers);
}

function renderPlayersTable(list) {
    const tbody = document.getElementById('all-players-body');
    let html = "";
    list.forEach(p => {
        const statusClass = p.online ? 'dot-online' : 'dot-offline';
        const banBadge = p.banned ? `<span class="ban-badge" title="Banido">🔨 BAN</span>` : '';
        const historyBtn = `<button class="btn-history-icon" onclick="event.stopPropagation(); quickHistory('${p.name}')" title="Ver Histórico">❗</button>`;
        html += `<tr onclick="showPlayerDetail('${p.name}')" style="cursor:pointer;">
            <td><span class="status-dot ${statusClass}"></span> ${p.online ? 'ONLINE' : 'OFFLINE'} ${banBadge}</td>
            <td>${p.name}</td>
            <td style="text-align:center;">${p.level ?? 1}</td>
            <td style="text-align:center;">${p.xp ?? 0}</td>
            <td style="color:#666; font-size:11px;">${p.last_login || '---'}</td>
            <td>${historyBtn}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function filterPlayers() {
    const term = document.getElementById('player-search-input').value.toLowerCase();
    const filtered = allPlayers.filter(p => p.name.toLowerCase().includes(term));
    renderPlayersTable(filtered);
}

function showPlayerDetail(name) {
    const p = allPlayers.find(pl => pl.name === name);
    if (!p) return;
    document.getElementById('det-name').innerText = p.name;
    document.getElementById('det-lvl').innerText = p.level ?? 1;
    document.getElementById('det-xp').innerText = p.xp ?? 0;
    document.getElementById('det-hp').innerText = (p.hp ?? 100) + "/100";
    document.getElementById('det-hunger').innerText = (p.hunger ?? 100) + "/100";
    document.getElementById('det-pos').innerText = `(${p.x ?? 0}, ${p.y ?? 0})`;
    
    let invHtml = "";
    if(!p.inventory || p.inventory.length === 0) invHtml = "<div class='placeholder'>Mochila vazia.</div>";
    else {
        const sum = {};
        p.inventory.forEach(id => sum[id] = (sum[id] || 0) + 1);
        for(let id in sum) {
            const item = allItems.find(i => i.id === id);
            invHtml += `<div class="inventory-item">
                <span>${item ? item.emoji : '❓'} ${item ? item.name : id}</span>
                <span>x${sum[id]}</span>
            </div>`;
        }
    }
    document.getElementById('det-inventory').innerHTML = invHtml;

    // Mostra/esconde botão de desbanir
    const unbanBtn = document.getElementById('btn-unban');
    if (p.banned) {
        unbanBtn.style.display = 'flex';
    } else {
        unbanBtn.style.display = 'none';
    }

    openModal('player-detail-modal');
}

async function resetPlayerPosition() {
    const name = document.getElementById('det-name').innerText;
    if(confirm(`Resetar posição de ${name}?`)) {
        await fetch(`http://localhost:3000/api/players/${encodeURIComponent(name)}/reset_pos`, { method: 'POST' });
        document.getElementById('det-pos').innerText = "(15, 15)";
        loadAllPlayers();
    }
}

// --- DROP EDITOR ---
function openDropEditor(index) {
    currentEditingSlotIndex = index;
    const mobId = document.getElementById('edit-mob-id').value;
    const mob = allMobs.find(m => m.id === mobId);
    if(!mob.drops) mob.drops = [];
    const drop = mob.drops[index] || { itemId: "", qty: 1, chance: 100 };

    const select = document.getElementById('drop-item-select');
    let html = '<option value="">--- Nenhum ---</option>';
    allItems.forEach(it => {
        html += `<option value="${it.id}">${it.emoji} ${it.name}</option>`;
    });
    select.innerHTML = html;
    select.value = drop.itemId;
    document.getElementById('drop-qty-input').value = drop.qty;
    document.getElementById('drop-chance-input').value = drop.chance;
    document.getElementById('drop-slot-title').innerText = `EDITANDO SLOT ${index + 1}`;
    openModal('drop-editor-modal');
}

function confirmDrop() {
    const mobId = document.getElementById('edit-mob-id').value;
    const mob = allMobs.find(m => m.id === mobId);
    const itemId = document.getElementById('drop-item-select').value;
    const qty = parseInt(document.getElementById('drop-qty-input').value);
    const chance = parseInt(document.getElementById('drop-chance-input').value);

    if(!mob.drops) mob.drops = [];
    if(itemId === "") mob.drops.splice(currentEditingSlotIndex, 1);
    else mob.drops[currentEditingSlotIndex] = { itemId, qty, chance };
    
    renderLootSlots(mob);
    closeModals();
}

// --- MODAL HELPERS ---
function openModal(id) {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.querySelectorAll('.modal-card').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

async function resetDB() {
    if(confirm("⚠️ TEM CERTEZA? Isso apagará TODOS os dados dos jogadores!")) {
        try {
            if (serverStatus === 'online') {
                const resp = await fetch('http://localhost:3000/api/reset_db', { method: 'POST' });
                if(!resp.ok) throw new Error();
            } else {
                await ipcRenderer.invoke('data-reset-players');
            }
            addLog('[ADMIN] ✅ Banco de dados resetado com sucesso!');
            loadAllPlayers();
        } catch(e) {
            addLog('[ADMIN] ❌ Erro ao resetar banco de dados.');
        }
    }
}

// =====================================================
// KICK / BAN / HISTÓRICO
// =====================================================

function openKickModal() {
    const name = document.getElementById('det-name').innerText;
    document.getElementById('kick-target-name').innerText = name;
    document.getElementById('kick-reason-input').value = '';
    openModal('kick-modal');
}

function openBanModal() {
    const name = document.getElementById('det-name').innerText;
    document.getElementById('ban-target-name').innerText = name;
    document.getElementById('ban-reason-input').value = '';
    document.getElementById('ban-duration-input').value = '1';
    openModal('ban-modal');
}

async function confirmKick() {
    if (serverStatus !== 'online') {
        addLog('[ADMIN] ⚠️ Não é possível expulsar jogadores com o servidor desligado.');
        return;
    }
    const name = document.getElementById('kick-target-name').innerText;
    const reason = document.getElementById('kick-reason-input').value.trim() || 'Kickado pelo administrador';
    
    try {
        const resp = await fetch(`http://localhost:3000/api/players/${encodeURIComponent(name)}/kick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        const data = await resp.json();
        closeModals();
        addLog(`[ADMIN] ⚡ ${name} foi kickado: ${reason}`);
        if (!data.wasOnline) addLog(`[ADMIN] ⚠️ ${name} não estava online, mas ação foi registrada.`);
        loadAllPlayers();
    } catch(e) {
        addLog('[ADMIN] ❌ Erro ao kickar jogador.');
    }
}

async function confirmBan() {
    const name = document.getElementById('ban-target-name').innerText;
    const reason = document.getElementById('ban-reason-input').value.trim() || 'Banido pelo administrador';
    const days = parseInt(document.getElementById('ban-duration-input').value) || 1;
    
    try {
        if (serverStatus === 'online') {
            const resp = await fetch(`http://localhost:3000/api/players/${encodeURIComponent(name)}/ban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, duration_days: days })
            });
            await resp.json();
        } else {
            await ipcRenderer.invoke('data-ban-player', { name, reason, days });
        }
        closeModals();
        addLog(`[ADMIN] 🔨 ${name} banido por ${days} dia(s): ${reason} ${serverStatus === 'offline' ? '(Offline)' : ''}`);
        loadAllPlayers();
    } catch(e) {
        addLog('[ADMIN] ❌ Erro ao banir jogador.');
    }
}

async function unbanPlayer() {
    const name = document.getElementById('det-name').innerText;
    if (!confirm(`Desbanir ${name}?`)) return;
    try {
        if (serverStatus === 'online') {
            await fetch(`http://localhost:3000/api/players/${encodeURIComponent(name)}/unban`, { method: 'POST' });
        } else {
            await ipcRenderer.invoke('data-unban-player', name);
        }
        addLog(`[ADMIN] ✅ ${name} foi desbanido ${serverStatus === 'offline' ? '(Offline)' : ''}.`);
        closeModals();
        loadAllPlayers();
    } catch(e) {
        addLog('[ADMIN] ❌ Erro ao desbanir jogador.');
    }
}

async function openHistoryModal() {
    const name = document.getElementById('det-name').innerText;
    await showHistory(name);
}

async function quickHistory(name) {
    await showHistory(name);
}

async function showHistory(name) {
    try {
        let data;
        if (serverStatus === 'online') {
            const resp = await fetch(`http://localhost:3000/api/players/${encodeURIComponent(name)}/history`);
            data = await resp.json();
        } else {
            data = await ipcRenderer.invoke('data-load-history', name);
        }

        document.getElementById('history-target-name').innerText = name;

        // Mostra aviso de ban ativo
        const banNotice = document.getElementById('active-ban-notice');
        if (data.activeBan) {
            banNotice.classList.remove('hidden');
            const expiresAt = new Date(data.activeBan.expires_at).toLocaleDateString('pt-BR');
            document.getElementById('active-ban-info').innerText =
                `Motivo: ${data.activeBan.reason} | Expira: ${expiresAt}`;
        } else {
            banNotice.classList.add('hidden');
        }

        const historyList = document.getElementById('history-list');
        if (!data.history || data.history.length === 0) {
            historyList.innerHTML = '<div class="placeholder" style="padding:30px;">Nenhum registro encontrado.</div>';
        } else {
            const actionIcons = {
                'KICK': '⚡',
                'BAN': '🔨',
                'UNBAN': '✅',
                'RESET_POS': '📍',
                'CONNECT': '🟢',
                'DISCONNECT': '🔴'
            };
            const actionColors = {
                'KICK': '#ff5e5e',
                'BAN': '#a855f7',
                'UNBAN': '#39ff14',
                'RESET_POS': '#00bcd4',
                'CONNECT': '#39ff14',
                'DISCONNECT': '#ff5e5e'
            };
            historyList.innerHTML = data.history.map(h => {
                const icon = actionIcons[h.action_type] || '📌';
                const color = actionColors[h.action_type] || '#aaa';
                const date = new Date(h.performed_at).toLocaleString('pt-BR');
                return `<div class="history-entry">
                    <span class="history-icon" style="color:${color}">${icon}</span>
                    <div class="history-body">
                        <div class="history-type" style="color:${color}">${h.action_type}</div>
                        <div class="history-reason">${h.reason || '-'} ${h.extra ? `(${h.extra})` : ''}</div>
                        <div class="history-date">${date} — por ${h.performed_by}</div>
                    </div>
                </div>`;
            }).join('');
        }

        openModal('history-modal');
    } catch(e) {
        addLog('[ADMIN] ❌ Erro ao carregar histórico do jogador.');
    }
}

// --- SERVER CONFIG ---
async function loadServerConfig() {
    if(serverStatus !== 'online') return;
    try {
        const resp = await fetch('http://localhost:3000/api/config');
        const data = await resp.json();
        document.getElementById('admin-check-collision').checked = data.playerCollision;
        document.getElementById('config-sync-status').innerText = '✅ Sincronizado com o Servidor';
        document.getElementById('config-sync-status').style.color = '#39ff14';
    } catch(e) {
        document.getElementById('config-sync-status').innerText = '❌ Erro de Sincronização';
        document.getElementById('config-sync-status').style.color = '#ff5e5e';
    }
}

async function updatePlayerCollision(enabled) {
    if(serverStatus !== 'online') return;
    try {
        await fetch('http://localhost:3000/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerCollision: enabled })
        });
        addLog(`[ADMIN] CONFIG: Colisão entre jogadores ${enabled ? 'HABILITADA' : 'DESABILITADA'}.`);
    } catch(e) {
        addLog('[ADMIN] ❌ Erro ao atualizar configuração no servidor.');
    }
}

window.onload = () => {
    showTab('dashboard');
    loadItems(); // Carrega itens cedo para os emojis nos drops
};
