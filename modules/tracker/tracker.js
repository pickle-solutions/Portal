function initTrackerModule() {
    // === 1. GLOBAL STATE ===
    let entries = [];
    let clients = [];
    let projects = [];
    let invoices = [];
    let hourlyRate = 0;
    let businessNumber = '';
    let invoiceCounter = 1001;

    // Timer State
    let timerInterval = null;
    let timerStartTime = null;
    let isTimerRunning = false;

    // Charts Instances
    let clientBarChart = null;
    let categoryPieChart = null;

    // === 2. DOM ELEMENT REFERENCES ===
    const els = {
        // Tabs
        tabs: document.querySelectorAll('.tab-btn'),
        contents: document.querySelectorAll('.tab-content'),

        // Main Displays
        timerDisplay: document.getElementById('timer-display'),
        logContainer: document.getElementById('time-log-container'),
        totalCost: document.getElementById('total-billable-cost'),
        totalTime: document.getElementById('total-all'),
        totalNonBillable: document.getElementById('total-non-billable'),

        // Timer Form
        startBtn: document.getElementById('start-stop-btn'),
        timerClient: document.getElementById('timer-client'),
        timerProject: document.getElementById('timer-project'),
        timerCat: document.getElementById('timer-category'),
        timerDesc: document.getElementById('timer-notes'),
        timerPriv: document.getElementById('timer-private-notes'),
        timerBill: document.getElementById('timer-billable'),

        // Manual Entry
        manualToggle: document.getElementById('show-manual-entry-btn'),
        manualBox: document.getElementById('manual-entry-container'),
        manualForm: document.getElementById('manual-form'),

        // Settings/Charts
        rateInput: document.getElementById('hourly-rate'),
        bizInput: document.getElementById('business-number'),
        clientChartCtx: document.getElementById('client-bar-chart'),
        catChartCtx: document.getElementById('category-pie-chart'),
        totalsByClient: document.getElementById('totals-by-client'),
        totalsByCat: document.getElementById('totals-by-category'),

        // Modals
        editModal: document.getElementById('edit-modal'),
        editForm: document.getElementById('edit-form'),
        invModal: document.getElementById('invoice-modal'),
        invForm: document.getElementById('invoice-client-form'),
        clientEditModal: document.getElementById('client-edit-modal'),
        clientEditForm: document.getElementById('client-edit-form'),
        projectEditModal: document.getElementById('project-edit-modal'),
        projectEditForm: document.getElementById('project-edit-form'),
        splitModal: document.getElementById('split-modal'),
        splitForm: document.getElementById('split-form'),

        // Buttons
        exportCsv: document.getElementById('export-csv-btn'),
        clearData: document.getElementById('clear-data-btn'),
        importBtn: document.getElementById('import-data-btn'),
        exportBtn: document.getElementById('export-data-btn'),
        importInput: document.getElementById('import-file-input'),
        genInvBtn: document.getElementById('generate-invoice-btn'),

        // Cancel Buttons
        cancelEdit: document.getElementById('cancel-edit-btn'),
        cancelInv: document.getElementById('cancel-invoice-btn'),
        cancelClientEdit: document.getElementById('cancel-client-edit-btn'),
        cancelProjectEdit: document.getElementById('cancel-project-edit-btn'),
        cancelSplit: document.getElementById('cancel-split-btn')
    };

    // === 3. INITIALIZATION ===
    function init() {
        loadData();
        setupEventListeners();
        renderAll();
    }

    function loadData() {
        try { clients = JSON.parse(localStorage.getItem('pickleTrackerClients')) || []; } catch (e) { clients = []; }
        try { projects = JSON.parse(localStorage.getItem('pickleTrackerProjects')) || []; } catch (e) { projects = []; }
        try { invoices = JSON.parse(localStorage.getItem('pickleTrackerInvoices')) || []; } catch (e) { invoices = []; }
        try {
            let rawEntries = JSON.parse(localStorage.getItem('pickleTrackerEntries'));
            entries = Array.isArray(rawEntries) ? rawEntries.map(fixEntryData) : [];
        } catch (e) { entries = []; }

        hourlyRate = parseFloat(localStorage.getItem('pickleTrackerRate')) || 0;
        businessNumber = localStorage.getItem('pickleTrackerBizNum') || '';
        invoiceCounter = Number(localStorage.getItem('pickleTrackerInvoiceCounter')) || 1001;

        if (els.rateInput) els.rateInput.value = hourlyRate;
        if (els.bizInput) els.bizInput.value = businessNumber;
    }

    function fixEntryData(e) {
        return {
            ...e,
            id: e.id || Date.now(),
            rounding: e.rounding || 'exact',
            client: e.client || 'none',
            projectId: e.projectId || 'none',
            isBilled: e.isBilled || false,
            isBillable: (e.isBillable !== undefined) ? e.isBillable : true,
            invoiceId: e.invoiceId || null,
            overridePrice: e.overridePrice !== undefined ? e.overridePrice : null
        };
    }

    function saveData() {
        localStorage.setItem('pickleTrackerEntries', JSON.stringify(entries));
        localStorage.setItem('pickleTrackerClients', JSON.stringify(clients));
        localStorage.setItem('pickleTrackerProjects', JSON.stringify(projects));
        localStorage.setItem('pickleTrackerInvoices', JSON.stringify(invoices));
        localStorage.setItem('pickleTrackerRate', hourlyRate);
        localStorage.setItem('pickleTrackerBizNum', businessNumber);
        localStorage.setItem('pickleTrackerInvoiceCounter', invoiceCounter);
    }

    // === 4. EVENT LISTENERS ===
    function setupEventListeners() {
        // Tab Switching
        els.tabs.forEach(btn => btn.addEventListener('click', handleTabSwitch));

        // Timer
        els.startBtn.addEventListener('click', toggleTimer);
        els.timerClient.addEventListener('change', () => updateProjectDropdown(els.timerClient, els.timerProject));

        // Manual Entry
        els.manualToggle.addEventListener('click', () => {
            els.manualBox.classList.toggle('is-hidden');
            els.manualToggle.textContent = els.manualBox.classList.contains('is-hidden') ? '+ Add Manual Entry' : 'Hide Manual Entry';
        });
        els.manualForm.addEventListener('submit', handleManualSubmit);
        const manClient = document.getElementById('manual-client');
        const manProj = document.getElementById('manual-project');
        if (manClient) manClient.addEventListener('change', () => updateProjectDropdown(manClient, manProj));

        // Forms & Modals
        if (els.editForm) els.editForm.addEventListener('submit', saveEditedEntry);
        if (els.cancelEdit) els.cancelEdit.addEventListener('click', () => els.editModal.style.display = 'none');

        if (els.genInvBtn) els.genInvBtn.addEventListener('click', openInvoiceModal);
        if (els.invForm) els.invForm.addEventListener('submit', handleGenerateInvoiceAction);
        if (els.cancelInv) els.cancelInv.addEventListener('click', () => els.invModal.style.display = 'none');

        if (els.clientEditForm) els.clientEditForm.addEventListener('submit', handleSaveClientEdit);
        if (els.cancelClientEdit) els.cancelClientEdit.addEventListener('click', () => els.clientEditModal.style.display = 'none');

        if (els.projectEditForm) els.projectEditForm.addEventListener('submit', handleSaveProjectEdit);
        if (els.cancelProjectEdit) els.cancelProjectEdit.addEventListener('click', () => els.projectEditModal.style.display = 'none');

        if (els.splitForm) els.splitForm.addEventListener('submit', handleSaveSplit);
        if (els.cancelSplit) els.cancelSplit.addEventListener('click', () => els.splitModal.style.display = 'none');

        // Settings
        if (els.rateInput) els.rateInput.addEventListener('change', (e) => { hourlyRate = parseFloat(e.target.value); saveData(); renderLog(); });
        if (els.bizInput) els.bizInput.addEventListener('change', (e) => { businessNumber = e.target.value; saveData(); });

        // Actions
        if (els.exportCsv) els.exportCsv.addEventListener('click', exportToCSV);
        if (els.clearData) els.clearData.addEventListener('click', clearAllData);
        if (els.exportBtn) els.exportBtn.addEventListener('click', exportJSON);
        if (els.importBtn) els.importBtn.addEventListener('click', () => els.importInput.click());
        if (els.importInput) els.importInput.addEventListener('change', handleImportJSON);

        // Add Forms
        const addClientForm = document.getElementById('add-client-form');
        if (addClientForm) addClientForm.addEventListener('submit', handleAddClient);

        const addProjectForm = document.getElementById('add-project-form');
        if (addProjectForm) addProjectForm.addEventListener('submit', handleAddProject);

        // Filters
        const searchBar = document.getElementById('search-bar');
        if (searchBar) searchBar.addEventListener('input', renderLog);

        const fStart = document.getElementById('filter-start-date');
        if (fStart) fStart.addEventListener('change', renderLog);

        const fEnd = document.getElementById('filter-end-date');
        if (fEnd) fEnd.addEventListener('change', renderLog);

        const fHideBilled = document.getElementById('filter-hide-billed');
        if (fHideBilled) fHideBilled.addEventListener('change', renderLog);

        const fClear = document.getElementById('filter-clear-btn');
        if (fClear) fClear.addEventListener('click', () => {
            document.getElementById('search-bar').value = '';
            document.getElementById('filter-start-date').value = '';
            document.getElementById('filter-end-date').value = '';
            document.getElementById('filter-hide-billed').checked = false;
            renderLog();
        });

        renderClientDropdowns();
    }

    // === 5. LOGIC & RENDERING ===

    function renderAll() {
        renderClientDropdowns();
        renderProjectsList();
        renderClientsList();
        renderLog();
        renderInvoicesList();
    }

    function handleTabSwitch(e) {
        els.tabs.forEach(b => b.classList.remove('active'));
        els.contents.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');

        if (e.target.dataset.tab === 'tab-manage') {
            renderCharts();
            renderClientsList();
            renderProjectsList();
        }
    }

    // --- CHART LOGIC ---
    function renderCharts() {
        const clientData = {};
        const catData = {};

        clients.forEach(c => clientData[c.id] = { unbilled: 0, unpaid: 0, name: c.name });
        clientData['none'] = { unbilled: 0, unpaid: 0, name: 'No Client' };

        entries.forEach(e => {
            const cid = e.client || 'none';
            const cat = e.category || 'Uncategorized';
            if (!catData[cat]) catData[cat] = 0;
            catData[cat] += e.duration;

            if (e.isBillable && !e.isBilled) {
                if (!clientData[cid]) clientData[cid] = { unbilled: 0, unpaid: 0, name: 'Unknown' };
                clientData[cid].unbilled += calculateCost(e);
            }
        });

        invoices.forEach(inv => {
            if (inv.status === 'billed') {
                const cid = inv.clientId || 'none';
                if (!clientData[cid]) clientData[cid] = { unbilled: 0, unpaid: 0, name: 'Unknown' };
                clientData[cid].unpaid += inv.total;
            }
        });

        if (els.clientChartCtx) {
            const labels = Object.values(clientData).filter(d => d.unbilled > 0 || d.unpaid > 0).map(d => d.name);
            const unbilledData = Object.values(clientData).filter(d => d.unbilled > 0 || d.unpaid > 0).map(d => d.unbilled);
            const unpaidData = Object.values(clientData).filter(d => d.unbilled > 0 || d.unpaid > 0).map(d => d.unpaid);

            if (clientBarChart) clientBarChart.destroy();
            clientBarChart = new Chart(els.clientChartCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Unbilled ($)', data: unbilledData, backgroundColor: '#558B2F' },
                        { label: 'Unpaid Inv ($)', data: unpaidData, backgroundColor: '#c94c4c' }
                    ]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });
        }

        if (els.catChartCtx) {
            const catLabels = Object.keys(catData);
            const catValues = Object.values(catData);

            if (categoryPieChart) categoryPieChart.destroy();
            categoryPieChart = new Chart(els.catChartCtx, {
                type: 'doughnut',
                data: {
                    labels: catLabels,
                    datasets: [{
                        data: catValues,
                        backgroundColor: ['#558B2F', '#7da453', '#4a90e2', '#c94c4c', '#f57f17', '#999']
                    }]
                }
            });
        }
    }

    // --- MAIN LOG RENDER ---
    function renderLog() {
        if (!els.logContainer) return;
        els.logContainer.innerHTML = '';
        const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

        const filterTxt = document.getElementById('search-bar').value.toLowerCase();
        const startD = document.getElementById('filter-start-date').value ? new Date(document.getElementById('filter-start-date').value) : null;
        const endD = document.getElementById('filter-end-date').value ? new Date(document.getElementById('filter-end-date').value) : null;
        if (endD) endD.setHours(23, 59, 59);
        const hideBilled = document.getElementById('filter-hide-billed').checked;

        const filtered = sorted.filter(e => {
            const cName = getClientName(e.client).toLowerCase();
            const pName = getProjectName(e.projectId).toLowerCase();
            const notes = (e.notes || '').toLowerCase();
            const dateObj = new Date(e.date);

            const matchTxt = !filterTxt || cName.includes(filterTxt) || pName.includes(filterTxt) || notes.includes(filterTxt);
            const matchStart = !startD || dateObj >= startD;
            const matchEnd = !endD || dateObj <= endD;
            const matchBilled = hideBilled ? !e.isBilled : true;

            return matchTxt && matchStart && matchEnd && matchBilled;
        });

        let lastDate = '';
        let groupDiv = null;

        filtered.forEach(entry => {
            const d = new Date(entry.date);
            const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

            if (dateStr !== lastDate) {
                lastDate = dateStr;
                groupDiv = document.createElement('div');
                groupDiv.className = 'log-date-group';
                const dailyTotal = filtered.filter(e => new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) === dateStr)
                    .reduce((sum, e) => sum + e.duration, 0);
                groupDiv.innerHTML = `<div class="log-date-header"><span>${dateStr}</span><span>${formatDuration(dailyTotal)}</span></div>`;
                els.logContainer.appendChild(groupDiv);
            }

            const row = document.createElement('div');

            // Check Invoice Status for color coding
            let isPaid = false;
            if (entry.isBilled && entry.invoiceId) {
                const inv = invoices.find(i => i.id === entry.invoiceId);
                if (inv && inv.status === 'paid') isPaid = true;
            }

            row.className = `log-entry-item ${entry.isBilled ? 'billed' : ''}`;
            const cost = calculateCost(entry);
            const displayDuration = entry.isBillable ? getRoundedDuration(entry.duration, entry.rounding) : entry.duration;
            const durationStr = formatDuration(displayDuration);
            const pName = getProjectName(entry.projectId);
            const cName = getClientName(entry.client);

            // Badges
            let badgeHtml = '';
            if (entry.category) badgeHtml += `<span class="badge cat">${escapeHTML(entry.category)}</span> `;

            if (!entry.isBillable) {
                badgeHtml += `<span class="badge pill nonbill">Non-Billable</span>`;
            } else if (isPaid) {
                badgeHtml += `<span class="badge pill unbilled" style="background:#e8f5e9; color:#2e7d32;">PAID</span>`;
            } else if (entry.isBilled) {
                badgeHtml += `<span class="badge pill billed">Billed</span>`;
            } else {
                badgeHtml += `<span class="badge pill unbilled">Unbilled</span>`;
            }

            if (entry.invoiceId) {
                badgeHtml += ` <span class="badge id-badge">${entry.invoiceId}</span>`;
            }

            row.innerHTML = `
                <div class="log-summary" onclick="this.nextElementSibling.classList.toggle('open')">
                    <div class="log-info">
                        <span class="log-title">${escapeHTML(pName)}</span>
                        <span class="log-client">${escapeHTML(cName)}</span>
                        <div class="log-meta">${badgeHtml}<span class="log-desc">${escapeHTML(entry.notes)}</span></div>
                    </div>
                    <div class="log-right">
                        <div class="log-time">${durationStr}</div>
                        ${entry.isBillable ? `<div class="log-cost">$${cost.toFixed(2)}</div>` : ''}
                    </div>
                </div>
                <div class="log-details-panel">
                    <div class="detail-row"><strong>Description:</strong> ${escapeHTML(entry.notes)}</div>
                    ${entry.privateNotes ? `<div class="detail-row" style="color:#666;"><strong>Private:</strong> ${escapeHTML(entry.privateNotes)}</div>` : ''}
                    
                    <div class="detail-controls">
                        ${entry.isBillable ? `
                            <div class="control-group">
                                <label>Rounding:</label>
                                <select class="rounding-select" data-id="${entry.id}">
                                    <option value="exact" ${entry.rounding === 'exact' ? 'selected' : ''}>Exact</option>
                                    <option value="up-1" ${entry.rounding === 'up-1' ? 'selected' : ''}>1m</option>
                                    <option value="up-5" ${entry.rounding === 'up-5' ? 'selected' : ''}>5m</option>
                                    <option value="up-15" ${entry.rounding === 'up-15' ? 'selected' : ''}>15m</option>
                                </select>
                            </div>
                        ` : ''}
                        <div class="control-group">
                             <input type="checkbox" class="billable-toggle" data-id="${entry.id}" ${entry.isBillable ? 'checked' : ''}> Billable
                        </div>
                        <div class="control-group">
                             <input type="checkbox" class="billed-toggle" data-id="${entry.id}" ${entry.isBilled ? 'checked' : ''}> Billed
                        </div>
                    </div>

                    <div class="detail-actions">
                        <button class="outline-btn small-btn split-btn" data-id="${entry.id}">Split</button>
                        <button class="outline-btn small-btn edit-btn" data-id="${entry.id}">Edit</button>
                        <button class="danger-btn small-btn del-btn" data-id="${entry.id}">Delete</button>
                    </div>
                </div>
            `;
            groupDiv.appendChild(row);
        });

        document.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', deleteEntry));
        document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', openEditModal));
        document.querySelectorAll('.split-btn').forEach(b => b.addEventListener('click', openSplitModal));
        document.querySelectorAll('.rounding-select').forEach(s => s.addEventListener('change', handleRoundingChange));
        document.querySelectorAll('.billable-toggle').forEach(c => c.addEventListener('change', handleBillableToggle));
        document.querySelectorAll('.billed-toggle').forEach(c => c.addEventListener('change', handleBilledToggle));

        updateTotals(filtered);
    }

    // --- MODAL ACTIONS ---
    function openEditModal(e) {
        const id = Number(e.target.dataset.id);
        const entry = entries.find(x => x.id === id);
        if (!entry) return;

        document.getElementById('edit-entry-id').value = entry.id;
        document.getElementById('edit-client').value = entry.client;
        updateProjectDropdown(document.getElementById('edit-client'), document.getElementById('edit-project'));
        document.getElementById('edit-project').value = entry.projectId;

        const { h, m } = minutesToHM(entry.duration * 60);
        document.getElementById('edit-hours').value = h;
        document.getElementById('edit-minutes').value = m;
        document.getElementById('edit-date').value = new Date(entry.date).toISOString().split('T')[0];
        document.getElementById('edit-category').value = entry.category || '';
        document.getElementById('edit-notes').value = entry.notes || '';
        document.getElementById('edit-private-notes').value = entry.privateNotes || '';
        document.getElementById('edit-billable').checked = entry.isBillable;
        document.getElementById('edit-override-cost').value = entry.overridePrice || '';

        els.editModal.style.display = 'block';
    }

    function saveEditedEntry(e) {
        e.preventDefault();
        const id = Number(document.getElementById('edit-entry-id').value);
        const idx = entries.findIndex(x => x.id === id);
        if (idx === -1) return;

        const h = parseFloat(document.getElementById('edit-hours').value) || 0;
        const m = parseFloat(document.getElementById('edit-minutes').value) || 0;
        const newDuration = h + (m / 60);

        entries[idx] = {
            ...entries[idx],
            client: document.getElementById('edit-client').value,
            projectId: document.getElementById('edit-project').value,
            duration: newDuration,
            date: document.getElementById('edit-date').valueAsDate ? document.getElementById('edit-date').valueAsDate.toISOString() : entries[idx].date,
            category: document.getElementById('edit-category').value,
            notes: document.getElementById('edit-notes').value,
            privateNotes: document.getElementById('edit-private-notes').value,
            isBillable: document.getElementById('edit-billable').checked,
            overridePrice: document.getElementById('edit-override-cost').value ? parseFloat(document.getElementById('edit-override-cost').value) : null
        };

        saveData();
        renderLog();
        els.editModal.style.display = 'none';
    }

    // Split Logic
    function openSplitModal(e) {
        const id = Number(e.target.dataset.id);
        const entry = entries.find(x => x.id === id);
        if (!entry) return;

        document.getElementById('split-entry-id').value = id;
        document.getElementById('split-original-notes').textContent = entry.notes || '(No notes)';
        document.getElementById('split-original-duration').textContent = formatDuration(entry.duration);
        els.splitModal.style.display = 'block';
    }

    function handleSaveSplit(e) {
        e.preventDefault();
        const id = Number(document.getElementById('split-entry-id').value);
        const original = entries.find(x => x.id === id);
        if (!original) return;

        const h = parseFloat(document.getElementById('split-hours').value) || 0;
        const m = parseFloat(document.getElementById('split-minutes').value) || 0;
        const billableDur = h + (m / 60);

        if (billableDur <= 0 || billableDur >= original.duration) return alert("Invalid split duration");
        const remainingDur = original.duration - billableDur;

        // 1. The Billable Portion
        entries.push({
            ...original, id: Date.now(), duration: billableDur, isBillable: true, isBilled: false, invoiceId: null
        });

        // 2. The Remainder (Mark as Billable but with $0 override)
        entries.push({
            ...original,
            id: Date.now() + 1,
            duration: remainingDur,
            isBillable: true, // Keep it billable so it shows in "Unbilled"
            overridePrice: 0, // But price it at $0
            isBilled: false,
            invoiceId: null,
            notes: (original.notes || '') + ' (Waived/Split)'
        });

        entries = entries.filter(x => x.id !== id);
        saveData();
        renderLog();
        els.splitModal.style.display = 'none';
        e.target.reset();
    }

    // --- PROJECT & CLIENT MANAGEMENT ---
    function renderClientsList() {
        const list = document.getElementById('client-list');
        if (!list) return;
        list.innerHTML = '';
        clients.forEach(c => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="list-header">
                    <strong>${escapeHTML(c.name)}</strong>
                    <div>
                        <button class="outline-btn small-btn edit-client-btn" data-id="${c.id}" style="margin-right:5px;">Edit</button>
                        <button class="danger-btn small-btn del-client-btn" data-id="${c.id}">Del</button>
                    </div>
                </div>
                <div class="list-sub">${escapeHTML(c.address || '')}</div>
            `;
            list.appendChild(li);
        });
        list.querySelectorAll('.del-client-btn').forEach(b => b.addEventListener('click', (e) => {
            if (confirm("Delete client?")) { clients = clients.filter(c => c.id != e.target.dataset.id); saveData(); renderAll(); }
        }));
        list.querySelectorAll('.edit-client-btn').forEach(b => b.addEventListener('click', (e) => {
            const c = clients.find(x => x.id == e.target.dataset.id);
            if (!c) return;
            document.getElementById('edit-client-id').value = c.id;
            document.getElementById('edit-client-name').value = c.name;
            document.getElementById('edit-client-address').value = c.address || '';
            els.clientEditModal.style.display = 'block';
        }));
    }

    function handleSaveClientEdit(e) {
        e.preventDefault();
        const id = Number(document.getElementById('edit-client-id').value);
        const idx = clients.findIndex(x => x.id === id);
        if (idx > -1) {
            clients[idx].name = document.getElementById('edit-client-name').value;
            clients[idx].address = document.getElementById('edit-client-address').value;
            saveData(); renderAll();
            els.clientEditModal.style.display = 'none';
        }
    }

    function renderProjectsList() {
        const list = document.getElementById('project-list');
        if (!list) return;
        list.innerHTML = '';
        projects.forEach(p => {
            const li = document.createElement('li');
            const cName = getClientName(p.clientId);

            let progress = 0, totalUsed = 0, budgetText = '';
            if (p.budgetAmount > 0) {
                entries.forEach(e => {
                    if (Number(e.projectId) === p.id && e.isBillable) {
                        const cost = calculateCost(e);
                        const dur = getRoundedDuration(e.duration, e.rounding);
                        if (p.budgetType === 'hours') totalUsed += dur;
                        else if (p.budgetType === 'dollars') totalUsed += cost;
                    }
                });
                progress = Math.min((totalUsed / p.budgetAmount) * 100, 100);
                if (p.budgetType === 'hours') budgetText = `${totalUsed.toFixed(2)} / ${p.budgetAmount} hrs`;
                else budgetText = `$${totalUsed.toFixed(2)} / $${p.budgetAmount}`;
            }

            li.innerHTML = `
                <div class="list-header">
                    <span><strong>${escapeHTML(p.name)}</strong> <small>(${cName})</small></span>
                    <div>
                         <button class="outline-btn small-btn edit-proj-btn" data-id="${p.id}" style="margin-right:5px;">Edit</button>
                         <button class="danger-btn small-btn del-proj-btn" data-id="${p.id}">Del</button>
                    </div>
                </div>
                ${p.budgetAmount > 0 ? `
                    <div class="progress-bar-container"><div class="progress-bar" style="width: ${progress}%;"></div></div>
                    <div class="progress-text">${budgetText} (${progress.toFixed(0)}%)</div>
                ` : ''}
            `;
            list.appendChild(li);
        });

        list.querySelectorAll('.del-proj-btn').forEach(b => b.addEventListener('click', (e) => {
            if (confirm("Delete project?")) { projects = projects.filter(p => p.id != e.target.dataset.id); saveData(); renderAll(); }
        }));
        list.querySelectorAll('.edit-proj-btn').forEach(b => b.addEventListener('click', (e) => {
            const p = projects.find(x => x.id == e.target.dataset.id);
            if (!p) return;
            document.getElementById('edit-project-id').value = p.id;
            document.getElementById('edit-project-name').value = p.name;
            document.getElementById('edit-project-client-select').value = p.clientId;
            document.getElementById('edit-project-budget-amount').value = p.budgetAmount || '';
            document.getElementById('edit-project-budget-type').value = p.budgetType || 'none';
            document.getElementById('edit-project-rate').value = p.rate || '';
            els.projectEditModal.style.display = 'block';
        }));
    }

    function handleSaveProjectEdit(e) {
        e.preventDefault();
        const id = Number(document.getElementById('edit-project-id').value);
        const idx = projects.findIndex(x => x.id === id);
        if (idx > -1) {
            projects[idx] = {
                ...projects[idx],
                name: document.getElementById('edit-project-name').value,
                clientId: Number(document.getElementById('edit-project-client-select').value),
                budgetAmount: parseFloat(document.getElementById('edit-project-budget-amount').value) || 0,
                budgetType: document.getElementById('edit-project-budget-type').value,
                rate: parseFloat(document.getElementById('edit-project-rate').value) || null
            };
            saveData(); renderAll();
            els.projectEditModal.style.display = 'none';
        }
    }

    // --- INVOICE GENERATION (Popup + Management) ---
    function openInvoiceModal() { renderClientDropdowns(); els.invModal.style.display = 'block'; }

    function handleGenerateInvoiceAction(e) {
        e.preventDefault();
        const cid = document.getElementById('invoice-client-select').value;
        if (cid === 'none') return alert('Select a client');

        const client = clients.find(c => c.id == cid);

        // --- MODIFIED FILTER: Include ALL unbilled entries (Billable & Non-Billable) ---
        const unbilled = entries.filter(ent => ent.client == cid && !ent.isBilled);

        if (unbilled.length === 0) return alert('No unbilled time found.');

        const invId = `INV-${invoiceCounter++}`;
        const { total } = calculateInvoiceTotal(unbilled);

        // Create Invoice Object
        invoices.push({ id: invId, clientId: Number(cid), date: new Date().toISOString(), total: total, status: 'billed', items: unbilled.map(x => x.id) });

        // Mark Entries
        unbilled.forEach(x => { x.isBilled = true; x.invoiceId = invId; });

        saveData();
        renderLog();
        renderInvoicesList();
        els.invModal.style.display = 'none';

        // Open Print Window
        openInvoicePrintWindow(invId);
    }

    function openInvoicePrintWindow(invId) {
        const inv = invoices.find(x => x.id === invId);
        if (!inv) return;
        const client = clients.find(c => c.id == inv.clientId);
        const invEntries = entries.filter(e => e.invoiceId === invId);

        // Generate HTML
        const html = getInvoiceHTML(inv, client, invEntries);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    }

    function deleteInvoice(id) {
        if (!confirm("Delete this invoice? The entries will be marked as 'Unbilled' again.")) return;

        // Remove Invoice
        invoices = invoices.filter(inv => inv.id !== id);

        // Update Entries (Undo billing)
        entries.forEach(e => {
            if (e.invoiceId === id) {
                e.isBilled = false;
                e.invoiceId = null;
            }
        });

        saveData();
        renderAll();
    }

    function renderInvoicesList() {
        const list = document.getElementById('invoice-list');
        if (!list) return;
        list.innerHTML = '';
        if (invoices.length === 0) { list.innerHTML = '<li class="summary-item">No invoices yet.</li>'; return; }

        [...invoices].reverse().forEach(inv => {
            const li = document.createElement('li');
            const cName = getClientName(inv.clientId);

            // Status Badge Logic
            let statusClass = inv.status === 'paid' ? 'paid' : 'billed';
            let statusText = inv.status.toUpperCase();

            li.innerHTML = `
                <div>
                    <div style="font-weight:bold; font-size:1.1rem;">${inv.id}</div>
                    <div style="color:#666;">${cName} &bull; ${new Date(inv.date).toLocaleDateString()}</div>
                </div> 
                <div style="text-align:right;">
                    <div style="font-weight:bold; font-size:1.1rem; margin-bottom:5px;">$${inv.total.toFixed(2)}</div>
                    <div style="display:flex; gap:5px; justify-content:flex-end; align-items:center;">
                        <span class="invoice-list-status ${statusClass}">${statusText}</span>
                        ${inv.status === 'billed' ? `<button class="primary-btn small-btn mark-paid-btn" data-id="${inv.id}">Pay</button>` : ''}
                        <button class="outline-btn small-btn view-inv-btn" data-id="${inv.id}">View</button>
                        <button class="danger-btn small-btn del-inv-btn" data-id="${inv.id}">x</button>
                    </div>
                </div>`;
            list.appendChild(li);
        });

        // Actions
        list.querySelectorAll('.mark-paid-btn').forEach(b => b.addEventListener('click', (e) => {
            const inv = invoices.find(x => x.id === e.target.dataset.id);
            if (inv) { inv.status = 'paid'; saveData(); renderAll(); }
        }));
        list.querySelectorAll('.view-inv-btn').forEach(b => b.addEventListener('click', (e) => {
            openInvoicePrintWindow(e.target.dataset.id);
        }));
        list.querySelectorAll('.del-inv-btn').forEach(b => b.addEventListener('click', (e) => {
            deleteInvoice(e.target.dataset.id);
        }));
    }

    function calculateInvoiceTotal(invEntries) {
        let subtotal = 0;
        invEntries.forEach(ent => {
            subtotal += calculateCost(ent);
        });
        const gst = subtotal * 0.05; // 5% GST
        return { total: subtotal + gst, subtotal, gst };
    }

    // === INVOICE TEMPLATE (Restored) ===
    function getInvoiceHTML(inv, client, invEntries) {
        let rows = '';
        let totalHours = 0;
        let subtotal = 0;

        invEntries.forEach(ent => {
            const p = projects.find(x => x.id == ent.projectId);
            const cost = calculateCost(ent);
            const dur = getRoundedDuration(ent.duration, ent.rounding);
            subtotal += cost;
            totalHours += dur;

            // --- MODIFIED: Show "(Non-Billable)" tag if it's explicitly non-billable ---
            const notes = escapeHTML(ent.notes) + (!ent.isBillable ? ' <em style="color:#777; font-size:0.85em;">(Non-Billable)</em>' : '');

            rows += `<tr>
                <td>${new Date(ent.date).toLocaleDateString()}</td>
                <td>${p ? p.name : 'No Project'} / ${ent.category || ''}</td>
                <td>${notes}</td>
                <td>${formatDuration(dur)}</td>
                <td>$${cost.toFixed(2)}</td>
            </tr>`;
        });

        const gst = subtotal * 0.05;
        const total = subtotal + gst;
        const today = new Date(inv.date).toLocaleDateString();

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Invoice ${inv.id}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; color: #333; }
                    .page { width: 8.5in; min-height: 11in; padding: 1in; margin: 1in auto; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
                    .header h1 { font-size: 2.5em; color: #558B2F; margin: 0; }
                    .invoice-details { text-align: right; }
                    .invoice-details h2 { font-size: 2em; margin: 0; color: #333; }
                    .invoice-details p { margin: 0; font-size: 1.1em; }
                    .info { display: flex; justify-content: space-between; margin-bottom: 40px; font-size: 0.9em; }
                    .info-box { line-height: 1.6; white-space: pre-wrap; }
                    .info-box strong { display: block; color: #555; font-size: 1.1em; margin-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th, td { border-bottom: 1px solid #eee; padding: 12px 8px; text-align: left; }
                    th { background-color: #f9f9f9; color: #555; font-weight: 600; text-transform: uppercase; font-size: 0.8em; }
                    td:nth-child(4), th:nth-child(4) { text-align: right; }
                    td:nth-child(5), th:nth-child(5) { text-align: right; }
                    .total-summary { display: flex; justify-content: flex-end; }
                    .total-summary table { width: 40%; min-width: 300px; }
                    .total-summary tr td:first-child { font-weight: 600; color: #555; }
                    .total-summary tr.grand-total td { font-size: 1.2em; font-weight: 600; border-top: 2px solid #333; padding-top: 10px; }
                    .payment-info { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.9em; line-height: 1.6; }
                    .notes { margin-top: 20px; font-size: 0.9em; color: #777; }
                    @media print {
                        body { background-color: #fff; color: #000; }
                        .page { width: 100%; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
                        th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="page">
                    <div class="header">
                        <h1>Pickle Solutions Inc.</h1>
                        <div class="invoice-details">
                            <h2>INVOICE</h2>
                            <p><strong>Invoice #: ${inv.id}</strong></p>
                            <p>Date: ${today}</p>
                        </div>
                    </div>
                    <div class="info">
                        <div class="info-box">
                            <strong>Bill To:</strong>
                            ${escapeHTML(client.name)}<br>
                            ${escapeHTML(client.address || '')}
                        </div>
                        <div class="info-box" style="text-align: right;">
                            <strong>From:</strong>
                            Pickle Solutions Inc.<br>
                            ${escapeHTML(businessNumber)}
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Project / Category</th>
                                <th>Description</th>
                                <th>Time</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                    <div class="total-summary">
                        <table>
                            <tbody>
                                <tr><td>Total Hours</td><td style="text-align: right;">${formatDuration(totalHours)}</td></tr>
                                <tr><td>Subtotal</td><td style="text-align: right;">$${subtotal.toFixed(2)}</td></tr>
                                <tr><td>GST (5%)</td><td style="text-align: right;">$${gst.toFixed(2)}</td></tr>
                                <tr class="grand-total"><td>Total Due</td><td style="text-align: right;">$${total.toFixed(2)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="payment-info"><strong>Payment Options:</strong><br>E-transfer: pickle-solutions-inc@vennpay.ca</div>
                    <div class="notes"><p>Thank you for your business!</p></div>
                </div>
            </body>
            </html>
        `;
    }

    // --- CORE HELPERS ---
    function handleAddClient(e) {
        e.preventDefault();
        const name = document.getElementById('new-client-name').value;
        if (name) {
            clients.push({ id: Date.now(), name: name, address: document.getElementById('new-client-address').value });
            saveData(); renderAll(); e.target.reset();
        }
    }

    function handleAddProject(e) {
        e.preventDefault();
        const cid = document.getElementById('project-client-select').value;
        const name = document.getElementById('new-project-name').value;
        if (cid && name) {
            projects.push({
                id: Date.now(), clientId: Number(cid), name: name,
                budgetAmount: parseFloat(document.getElementById('project-budget-amount').value) || 0,
                budgetType: document.getElementById('project-budget-type').value,
                rate: parseFloat(document.getElementById('project-rate').value) || null
            });
            saveData(); renderAll(); e.target.reset();
        }
    }

    function toggleTimer() {
        if (isTimerRunning) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            els.startBtn.textContent = "Start Timer";
            els.startBtn.classList.remove('running');
            const duration = (Date.now() - timerStartTime) / 3600000;
            entries.push({
                id: Date.now(), client: els.timerClient.value, projectId: els.timerProject.value,
                category: els.timerCat.value, notes: els.timerDesc.value, privateNotes: els.timerPriv.value,
                isBillable: els.timerBill.checked, duration: duration, date: new Date(timerStartTime).toISOString(),
                isBilled: false, rounding: 'exact'
            });
            saveData(); renderLog(); els.timerDesc.value = ''; els.timerPriv.value = ''; els.timerDisplay.textContent = '00:00:00';
        } else {
            isTimerRunning = true; timerStartTime = Date.now();
            els.startBtn.textContent = "Stop & Save"; els.startBtn.classList.add('running');
            timerInterval = setInterval(() => {
                const s = Math.floor((Date.now() - timerStartTime) / 1000);
                els.timerDisplay.textContent = `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
            }, 1000);
        }
    }

    function handleManualSubmit(e) {
        e.preventDefault();
        const h = parseFloat(document.getElementById('manual-hours').value) || 0;
        const m = parseFloat(document.getElementById('manual-minutes').value) || 0;
        const duration = h + (m / 60);
        if (duration <= 0) return alert("Please enter a duration.");
        const dateVal = document.getElementById('manual-date').value ? new Date(document.getElementById('manual-date').value + 'T12:00:00').toISOString() : new Date().toISOString();

        entries.push({
            id: Date.now(), client: document.getElementById('manual-client').value, projectId: document.getElementById('manual-project').value,
            category: document.getElementById('manual-category').value, notes: document.getElementById('manual-notes').value,
            privateNotes: document.getElementById('manual-private-notes').value, isBillable: document.getElementById('manual-billable').checked,
            duration: duration, date: dateVal, isBilled: false, rounding: 'exact'
        });
        saveData(); renderLog();

        // --- FIX 2: Reset Form & Revert Button Text ---
        els.manualForm.reset();
        els.manualBox.classList.add('is-hidden');
        els.manualToggle.textContent = '+ Add Manual Entry';
    }

    function handleImportJSON(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.entries) entries = data.entries.map(fixEntryData);
                if (data.clients) clients = data.clients;
                if (data.projects) projects = data.projects;
                if (data.invoices) invoices = data.invoices;
                if (data.hourlyRate) hourlyRate = data.hourlyRate;
                saveData(); renderAll(); alert('Import Successful!');
            } catch (err) { alert('Error: ' + err.message); }
        };
        reader.readAsText(file);
    }

    function handleRoundingChange(e) {
        const id = Number(e.target.dataset.id);
        const idx = entries.findIndex(x => x.id === id);
        if (idx > -1) { entries[idx].rounding = e.target.value; saveData(); renderLog(); }
    }
    function handleBillableToggle(e) {
        const id = Number(e.target.dataset.id);
        const idx = entries.findIndex(x => x.id === id);
        if (idx > -1) {
            entries[idx].isBillable = e.target.checked;
            if (!entries[idx].isBillable) { entries[idx].isBilled = false; entries[idx].invoiceId = null; }
            saveData(); renderLog();
        }
    }
    function handleBilledToggle(e) {
        const id = Number(e.target.dataset.id);
        const idx = entries.findIndex(x => x.id === id);
        if (idx > -1) {
            entries[idx].isBilled = e.target.checked;
            if (!entries[idx].isBilled) entries[idx].invoiceId = null;
            saveData(); renderLog();
        }
    }
    function deleteEntry(e) {
        if (confirm('Delete entry?')) {
            entries = entries.filter(x => x.id !== Number(e.target.dataset.id));
            saveData(); renderLog();
        }
    }
    function clearAllData() {
        if (confirm("Delete EVERYTHING?")) {
            entries = []; clients = []; projects = []; invoices = [];
            saveData(); location.reload();
        }
    }
    function exportJSON() {
        const blob = new Blob([JSON.stringify({ entries, clients, projects, invoices, hourlyRate, businessNumber, invoiceCounter })], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tracker_backup.json'; a.click();
    }
    function exportToCSV() {
        let csv = "Date,Client,Project,Category,Duration,Cost,Notes\n";
        entries.forEach(e => { csv += `"${e.date}","${getClientName(e.client)}","${getProjectName(e.projectId)}","${e.category}",${e.duration},${calculateCost(e)},"${(e.notes || '').replace(/"/g, '""')}"\n`; });
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'export.csv'; a.click();
    }

    // Render Helpers
    function renderClientDropdowns() {
        const selects = [els.timerClient, document.getElementById('manual-client'), document.getElementById('edit-client'), document.getElementById('invoice-client-select'), document.getElementById('project-client-select'), document.getElementById('edit-project-client-select')];
        selects.forEach(sel => {
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = sel.id.includes('project-client') || sel.id.includes('invoice') ? '<option value="">Select Client</option>' : '<option value="none">No Client</option>';
            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id; opt.textContent = c.name; sel.appendChild(opt);
            });
            if (clients.find(c => c.id == current)) sel.value = current;
        });
    }

    function updateProjectDropdown(clientSel, projectSel) {
        if (!projectSel) return;
        const cid = clientSel.value;
        projectSel.innerHTML = '<option value="none">No Project</option>';
        projects.filter(p => p.clientId == cid).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id; opt.textContent = p.name; projectSel.appendChild(opt);
        });
    }

    function updateTotals(filtered) {
        let billable = 0, nonBillable = 0, billableCost = 0;
        let clientTotals = {}, catTotals = {};

        filtered.forEach(e => {
            const dur = e.isBillable ? getRoundedDuration(e.duration, e.rounding) : e.duration;
            if (e.isBillable) {
                billable += dur;
                // --- FIX: Only add to "Unbilled" total if NOT billed ---
                if (!e.isBilled) {
                    billableCost += calculateCost(e);
                }
            }
            else { nonBillable += dur; }

            const cName = getClientName(e.client);
            if (!clientTotals[cName]) clientTotals[cName] = { time: 0, cost: 0 };
            clientTotals[cName].time += dur;
            if (e.isBillable) clientTotals[cName].cost += calculateCost(e);

            const cat = e.category || 'None';
            if (!catTotals[cat]) catTotals[cat] = 0;
            catTotals[cat] += dur;
        });

        if (els.totalCost) els.totalCost.textContent = `$${billableCost.toFixed(2)}`;
        if (els.totalTime) els.totalTime.textContent = formatDuration(billable + nonBillable);
        if (els.totalNonBillable) els.totalNonBillable.textContent = formatDuration(nonBillable);

        if (els.totalsByClient) {
            els.totalsByClient.innerHTML = '<h3>Client Summary</h3>' + Object.keys(clientTotals).map(k => `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:4px;">
                    <span>${k}</span> <span>${formatDuration(clientTotals[k].time)} / $${clientTotals[k].cost.toFixed(2)}</span>
                </div>
            `).join('');
        }
        if (els.totalsByCat) {
            els.totalsByCat.innerHTML = '<h3>Category Summary</h3>' + Object.keys(catTotals).map(k => `
                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:4px;">
                    <span>${k}</span> <span>${formatDuration(catTotals[k])}</span>
                </div>
            `).join('');
        }
    }

    function getClientName(id) { const c = clients.find(x => x.id == id); return c ? c.name : 'No Client'; }
    function getProjectName(id) { const p = projects.find(x => x.id == id); return p ? p.name : 'No Project'; }

    function formatDuration(h) {
        const totalMins = Math.round(h * 60);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        return `${hrs}h ${mins}m`;
    }

    function minutesToHM(m) { return { h: Math.floor(m / 60), m: Math.round(m % 60) }; }

    function getRoundedDuration(d, r) {
        const m = d * 60;
        if (r === 'up-1') return Math.ceil(m) / 60;
        if (r === 'up-5') return (Math.ceil(m / 5) * 5) / 60;
        if (r === 'up-15') return (Math.ceil(m / 15) * 15) / 60;
        return d;
    }

    function calculateCost(e) {
        if (!e.isBillable) return 0;
        if (e.overridePrice !== null && e.overridePrice !== undefined) return e.overridePrice; // --- FIX 1: Respect 0 ---
        let rate = hourlyRate;
        const p = projects.find(x => x.id == e.projectId);
        if (p && p.rate) rate = p.rate;
        return getRoundedDuration(e.duration, e.rounding) * rate;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    init();
}