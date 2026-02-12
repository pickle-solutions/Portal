let propertyData = [];
let currentPropId = null;

const VALUATION_LOGIC = `
VALUATION ALGORITHM (Luxury/Recreational Logic):
1. ANCHOR METRIC: Identify the primary value driver (e.g., Waterfront frontage > House SqFt). Apply scarcity multipliers.
2. CMA (50% Weight): Filter for sold comps in the last 12 months.
3. REPLACEMENT COST (30% Weight): Calculate Land Value + Construction + Infrastructure.
4. SCARCITY (20% Weight): Assess rarity.
5. CALCULATION: Final Value = (CMA * 0.50) + (Replacement * 0.30) + (Scarcity * 0.20).
`;

function initPropertyModule() {
    console.log('Property Module: Starting...');
    if (typeof injectFilterBar !== 'function') return alert("Error: Clear cache (Ctrl+F5).");
    loadProperties();
    setupEventListeners();
    injectFilterBar();
    renderGrid();
}

function loadProperties() {
    try {
        const stored = localStorage.getItem('portal_properties');
        propertyData = stored ? JSON.parse(stored) : [];
    } catch (e) { propertyData = []; }
}

function saveProperties() {
    try {
        localStorage.setItem('portal_properties', JSON.stringify(propertyData));
        renderGrid();
        updateCityDropdown();
        const statsEl = document.getElementById('header-stats');
        if (statsEl) statsEl.innerText = `${propertyData.length} Properties`;
    } catch (e) { alert("Save Failed: " + e.message); }
}

function getAIPromptFields() {
    return `
TASK: Act as a Critical Real Estate Appraiser. Do NOT be optimistic.
${VALUATION_LOGIC}
INSTRUCTIONS FOR VALUE:
1. Determine a Low-High Market Value Range based on Comps.
2. For 'aiEst', return the CONSERVATIVE MIDPOINT.
3. If List Price > Market Value, 'aiEst' MUST be lower.

RETURN JSON:
- title (short nickname)
- mls, city
- bed, bath, suite
- houseSize, landSize
- zoning
- power, water
- features (Start string with "Est. Range: $X - $Y. ")
- riskFire (1-5), riskClimate (1-5)
- distFire, distCity, distGrocery, distHospital
- tax
- carryUtils
- aiEst (Conservative single number)
`;
}

function copySinglePrompt() {
    const prop = propertyData.find(p => p.id === currentPropId);
    if (!prop) return alert("Select a property first.");
    const prompt = `Research this property:\nAddress: ${prop.address}\nMLS: ${prop.mls}\n\n${getAIPromptFields()}`;
    navigator.clipboard.writeText(prompt);
    alert("Valuation Prompt Copied!");
}

function copyBulkPrompt() {
    if (propertyData.length === 0) return alert("No properties found.");
    const list = propertyData.map(p => `- ${p.address} (MLS: ${p.mls})`).join("\n");
    const prompt = `Research these listings. Return ONLY a JSON ARRAY of objects.\n${getAIPromptFields()}\n\nListings:\n${list}`;
    navigator.clipboard.writeText(prompt);
    alert("Bulk Prompt Copied!");
}

function copyNewPrompt() {
    const newProps = propertyData.filter(p => p.aiProcessed !== true);
    if (newProps.length === 0) return alert("All properties have been AI Valued!");
    const list = newProps.map(p => `- ${p.address} (MLS: ${p.mls})`).join("\n");
    const prompt = `Research these NEW listings. Return ONLY a JSON ARRAY of objects.\n${getAIPromptFields()}\n\nListings:\n${list}`;
    navigator.clipboard.writeText(prompt);
    alert(`Copied prompt for ${newProps.length} properties.`);
}

/**
 * FEATURE 2: UPDATED COMPARE TABLE (More Details)
 */
function openCompareModal() {
    const checks = document.querySelectorAll('.card-select:checked');
    const ids = Array.from(checks).map(c => c.value);
    if (ids.length < 2) return alert("Check at least 2 properties to compare.");
    const comps = propertyData.filter(p => ids.includes(p.id));
    const container = document.getElementById('compare-table-container');

    let html = `<table class="compare-table"><thead><tr><th>Feature</th>`;
    comps.forEach(p => { html += `<th>${p.title || p.address}</th>`; });
    html += `</tr></thead><tbody>`;

    // EXPANDED ROW LIST
    const rows = [
        { label: "Photo", key: "img", type: "img" },
        { label: "MLS #", key: "mls" },
        { label: "List Price", key: "price", type: "money" },
        { label: "AI Value", key: "aiEst", type: "money_highlight" },
        { label: "Address", key: "address" },
        { label: "City", key: "city" },
        { label: "Tax / Yr", key: "tax", type: "money" },
        { label: "Utils / Mo", key: "carryUtils", type: "money" },
        { label: "Mortgage/Mo", key: "mortgageAmt", type: "money" }, // Requires mortgageAmt calculated or saved
        { label: "Size (sqft)", key: "houseSize" },
        { label: "Land", key: "landSize" },
        { label: "Bed/Bath", key: "bed_bath" },
        { label: "Suite", key: "suite" },
        { label: "Zoning", key: "zoning" },
        { label: "Power/Water", key: "infra" },
        { label: "Dist. Fire", key: "distFire" },
        { label: "Dist. Grocery", key: "distGrocery" },
        { label: "Dist. Hospital", key: "distHospital" },
        { label: "Fire Risk", key: "riskFire" },
        { label: "Climate Risk", key: "riskClimate" },
        { label: "User Score", key: "user_score" },
        { label: "Spouse Score", key: "spouse_score" },
        { label: "Realtor Score", key: "realtor_score" },
        { label: "Features", key: "features", type: "text" },
        { label: "Notes", key: "notes", type: "text" }
    ];

    rows.forEach(row => {
        html += `<tr><td>${row.label}</td>`;
        comps.forEach(p => {
            let val = p[row.key] || '-';

            // Special Formatters
            if (row.type === 'img') val = p.img ? `<img src="${p.img}">` : '(No Photo)';
            else if (row.type === 'money') val = p[row.key] ? `$${parseInt(p[row.key]).toLocaleString()}` : '-';
            else if (row.type === 'money_highlight') val = p.aiEst ? `<span class="compare-highlight">$${parseInt(p.aiEst).toLocaleString()}</span>` : '-';
            else if (row.key === 'bed_bath') val = `${p.bed || '-'}bd / ${p.bath || '-'}ba`;
            else if (row.key === 'infra') val = `${p.power || '-'}/${p.water || '-'}`;
            else if (row.key === 'user_score') val = p.ratings?.user?.score || '-';
            else if (row.key === 'spouse_score') val = p.ratings?.spouse?.score || '-';
            else if (row.key === 'realtor_score') val = p.ratings?.realtor?.score || '-';
            else if (row.type === 'text') val = `<div style="max-height:80px; overflow-y:auto; font-size:0.8em; text-align:left;">${val}</div>`;

            html += `<td>${val}</td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
    document.getElementById('compare-modal').classList.remove('hidden');
}

/**
 * FEATURE 3: SMARTER SANITIZER (Fixes Risk Missing Issue)
 */
function sanitizeAIItem(item) {
    const clean = { ...item };

    // Strict number fields
    const numberFields = [
        'houseSize', 'bed', 'bath', 'price', 'aiEst', 'tax', 'carryUtils',
        'riskFire', 'riskClimate', 'distFire', 'distCity', 'distGrocery', 'distHospital'
    ];

    numberFields.forEach(key => {
        if (clean[key] !== undefined && clean[key] !== null) {
            let rawStr = String(clean[key]).toLowerCase();

            // RISK FIX: If AI says "Low", convert to 1. "High" convert to 5.
            if ((key === 'riskFire' || key === 'riskClimate') && isNaN(parseFloat(rawStr))) {
                if (rawStr.includes('low')) clean[key] = 1;
                else if (rawStr.includes('mod')) clean[key] = 3;
                else if (rawStr.includes('high')) clean[key] = 5;
                else delete clean[key]; // Can't understand it
                return;
            }

            // Standard Number Cleaning
            const raw = String(clean[key]).replace(/,/g, '').replace(/[^0-9.-]/g, '');
            const val = parseFloat(raw);

            if (!isNaN(val)) {
                clean[key] = val;
            } else {
                delete clean[key];
            }
        } else {
            delete clean[key];
        }
    });

    return clean;
}

function applyDataMap(data) {
    const map = {
        'title': 'prop-title', 'city': 'prop-city', 'mls': 'prop-mls',
        'bed': 'prop-bed', 'bath': 'prop-bath', 'suite': 'prop-suite',
        'houseSize': 'prop-houseSize', 'landSize': 'prop-landSize', 'zoning': 'prop-zoning',
        'power': 'prop-power', 'water': 'prop-water', 'features': 'prop-features',
        'tax': 'prop-tax', 'carryUtils': 'prop-carryUtils', 'aiEst': 'prop-aiEst',
        'riskFire': 'prop-riskFire', 'riskClimate': 'prop-riskClimate',
        'distFire': 'prop-distFire', 'distCity': 'prop-distCity',
        'distGrocery': 'prop-distGrocery', 'distHospital': 'prop-distHospital',
        'img': 'prop-img', 'notes': 'prop-notes'
    };
    for (let key in map) {
        if (data[key] !== undefined && document.getElementById(map[key])) {
            document.getElementById(map[key]).value = data[key];
        }
    }
}

function applySingleAIUpdate() {
    try {
        const raw = JSON.parse(document.getElementById('ai-update-input').value);
        const data = sanitizeAIItem(raw);
        applyDataMap(data);
        const idx = propertyData.findIndex(p => p.id === currentPropId);
        if (idx > -1) propertyData[idx] = { ...propertyData[idx], ...data, aiProcessed: true };

        document.getElementById('ai-update-input').value = '';
        calculateMonthlyCost();
        alert("AI Data Applied! (Cleaned)");
    } catch (e) { alert("Invalid JSON"); }
}

function applyBulkUpdate() {
    try {
        const list = JSON.parse(document.getElementById('bulk-ai-input').value);
        if (!Array.isArray(list)) throw new Error("Not an array");
        let count = 0;
        list.forEach(item => {
            const idx = propertyData.findIndex(p => p.mls === item.mls);
            if (idx > -1) {
                const cleanItem = sanitizeAIItem(item);
                propertyData[idx] = { ...propertyData[idx], ...cleanItem, aiProcessed: true };
                count++;
            }
        });
        saveProperties();
        document.getElementById('bulk-ai-modal').classList.add('hidden');
        document.getElementById('bulk-ai-input').value = '';
        alert(`Updated ${count} properties.`);
    } catch (e) { alert("Bulk Error: " + e.message); }
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        let incoming;
        try { incoming = JSON.parse(text); } catch (e) { return alert("Clipboard not valid JSON."); }
        if (!incoming.mls) return alert("Data missing MLS.");

        const idx = propertyData.findIndex(p => p.mls === incoming.mls);
        if (idx > -1) {
            const proceed = confirm(`MLS ${incoming.mls} already exists. Overwrite?`);
            if (!proceed) return;
            propertyData[idx] = { ...propertyData[idx], ...incoming };
            alert(`Updated: ${incoming.mls}`);
        } else {
            incoming.id = Date.now().toString();
            incoming.importDate = new Date().toISOString();
            incoming.aiProcessed = false;
            propertyData.push(incoming);
            alert(`Added: ${incoming.address}`);
        }
        saveProperties();
    } catch (e) { alert("Paste Error: " + e.message); }
}

function openProperty(id) {
    const p = propertyData.find(x => x.id === id) || {
        id: Date.now().toString(), status: 'Watchlist', ratings: { user: {}, spouse: {}, realtor: {} }, aiProcessed: false
    };
    currentPropId = p.id;

    const fields = ['title', 'mls', 'status', 'address', 'city', 'bed', 'bath', 'suite', 'houseSize', 'landSize', 'zoning', 'power', 'water', 'features', 'notes', 'price', 'tax', 'carryUtils', 'aiEst', 'riskFire', 'riskClimate', 'distFire', 'distCity', 'distGrocery', 'distHospital'];

    fields.forEach(f => {
        const el = document.getElementById(`prop-${f}`);
        if (el) el.value = p[f] || '';
    });

    document.getElementById('prop-img').value = p.img || '';
    const linkBtn = document.getElementById('link-external');
    let rawUrl = p.url || '';
    if (rawUrl) {
        if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
        linkBtn.href = rawUrl;
        linkBtn.style.display = 'inline-flex';
        document.getElementById('prop-url').value = rawUrl;
    } else {
        linkBtn.style.display = 'none';
        document.getElementById('prop-url').value = '';
    }

    document.getElementById('rate-user-score').value = p.ratings?.user?.score || '';
    document.getElementById('rate-user-note').value = p.ratings?.user?.note || '';
    document.getElementById('rate-spouse-score').value = p.ratings?.spouse?.score || '';
    document.getElementById('rate-spouse-note').value = p.ratings?.spouse?.note || '';
    document.getElementById('rate-realtor-score').value = p.ratings?.realtor?.score || '';
    document.getElementById('rate-realtor-note').value = p.ratings?.realtor?.note || '';
    document.getElementById('calc-mortgage').value = p.mortgageAmt || 0;

    document.getElementById('property-grid-view').classList.add('hidden');
    document.getElementById('property-detail-view').classList.remove('hidden');
    const filterBar = document.getElementById('filter-bar-area');
    if (filterBar) filterBar.style.display = 'none';
    calculateMonthlyCost();
}

function saveCurrentProperty() {
    const idx = propertyData.findIndex(p => p.id === currentPropId);
    const updated = {
        id: currentPropId,
        importDate: (idx > -1 ? propertyData[idx].importDate : new Date().toISOString()),
        aiProcessed: (idx > -1 ? propertyData[idx].aiProcessed : false),
        mls: document.getElementById('prop-mls').value,
        title: document.getElementById('prop-title').value,
        status: document.getElementById('prop-status').value,
        address: document.getElementById('prop-address').value,
        city: document.getElementById('prop-city').value,
        url: document.getElementById('prop-url').value,
        img: document.getElementById('prop-img').value,
        bed: document.getElementById('prop-bed').value,
        bath: document.getElementById('prop-bath').value,
        suite: document.getElementById('prop-suite').value,
        houseSize: document.getElementById('prop-houseSize').value,
        landSize: document.getElementById('prop-landSize').value,
        zoning: document.getElementById('prop-zoning').value,
        power: document.getElementById('prop-power').value,
        water: document.getElementById('prop-water').value,
        features: document.getElementById('prop-features').value,
        notes: document.getElementById('prop-notes').value,
        price: parseFloat(document.getElementById('prop-price').value) || 0,
        aiEst: parseFloat(document.getElementById('prop-aiEst').value) || 0,
        tax: parseFloat(document.getElementById('prop-tax').value) || 0,
        carryUtils: parseFloat(document.getElementById('prop-carryUtils').value) || 0,
        mortgageAmt: parseFloat(document.getElementById('calc-mortgage').value) || 0,
        riskFire: document.getElementById('prop-riskFire').value,
        riskClimate: document.getElementById('prop-riskClimate').value,
        distFire: document.getElementById('prop-distFire').value,
        distCity: document.getElementById('prop-distCity').value,
        distGrocery: document.getElementById('prop-distGrocery').value,
        distHospital: document.getElementById('prop-distHospital').value,
        ratings: {
            user: { score: document.getElementById('rate-user-score').value, note: document.getElementById('rate-user-note').value },
            spouse: { score: document.getElementById('rate-spouse-score').value, note: document.getElementById('rate-spouse-note').value },
            realtor: { score: document.getElementById('rate-realtor-score').value, note: document.getElementById('rate-realtor-note').value }
        }
    };
    if (idx > -1) propertyData[idx] = updated;
    else propertyData.push(updated);
    saveProperties();
    closeEditor();
}

function calculateMonthlyCost() {
    const mortgage = parseFloat(document.getElementById('calc-mortgage').value) || 0;
    const tax = parseFloat(document.getElementById('prop-tax').value) || 0;
    const utils = parseFloat(document.getElementById('prop-carryUtils').value) || 0;
    const rate = parseFloat(document.getElementById('calc-rate').value) || 5.2;
    let monthlyMtg = 0;
    if (mortgage > 0) {
        const r = (rate / 100) / 12;
        const n = 300;
        monthlyMtg = mortgage * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }
    const total = monthlyMtg + (tax / 12) + utils;
    document.getElementById('calc-result').innerText = `$${Math.round(total).toLocaleString()} / mo`;
}

function closeEditor() {
    document.getElementById('property-detail-view').classList.add('hidden');
    document.getElementById('property-grid-view').classList.remove('hidden');
    const filterBar = document.getElementById('filter-bar-area');
    if (filterBar) filterBar.style.display = 'flex';
    applyFilters();
}

function exportToCSV() {
    if (!propertyData.length) return alert("No data");
    const columns = [
        "mls", "status", "title", "address", "city", "price", "aiEst", "tax", "carryUtils", "mortgageAmt",
        "bed", "bath", "suite", "houseSize", "landSize", "zoning", "power", "water",
        "riskFire", "riskClimate", "distFire", "distCity", "distGrocery", "distHospital",
        "url", "img", "features", "notes", "importDate",
        "User_Score", "User_Note", "Spouse_Score", "Spouse_Note", "Realtor_Score", "Realtor_Note"
    ];
    const rows = propertyData.map(p => {
        return columns.map(col => {
            let val = "";
            if (col.startsWith("User_")) val = p.ratings?.user?.[col.split("_")[1].toLowerCase()] || "";
            else if (col.startsWith("Spouse_")) val = p.ratings?.spouse?.[col.split("_")[1].toLowerCase()] || "";
            else if (col.startsWith("Realtor_")) val = p.ratings?.realtor?.[col.split("_")[1].toLowerCase()] || "";
            else val = p[col] || "";
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",");
    });
    const csvContent = columns.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `properties_export.csv`; a.click();
}

function handleCSVImport(e) {
    const reader = new FileReader();
    reader.onload = (evt) => {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const headers = lines[0].split(",").map(h => h.trim());
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
            const obj = { ratings: { user: {}, spouse: {}, realtor: {} } };
            headers.forEach((h, idx) => {
                const val = values[idx];
                if (h.includes("User_")) obj.ratings.user[h.split("_")[1].toLowerCase()] = val;
                else if (h.includes("Spouse_")) obj.ratings.spouse[h.split("_")[1].toLowerCase()] = val;
                else if (h.includes("Realtor_")) obj.ratings.realtor[h.split("_")[1].toLowerCase()] = val;
                else obj[h] = val;
            });
            if (obj.mls) {
                const existingIdx = propertyData.findIndex(p => p.mls === obj.mls);
                if (existingIdx > -1) propertyData[existingIdx] = { ...propertyData[existingIdx], ...obj };
                else { obj.id = Date.now() + Math.random().toString(); propertyData.push(obj); }
                count++;
            }
        }
        saveProperties();
        alert(`Imported ${count} properties!`);
    };
    reader.readAsText(e.target.files[0]);
}

function setupEventListeners() {
    document.getElementById('btn-add-property').onclick = () => openProperty(null);
    document.getElementById('btn-paste-property').onclick = pasteFromClipboard;
    document.getElementById('btn-copy-bulk-ai').onclick = copyBulkPrompt;
    document.getElementById('btn-copy-new-ai').onclick = copyNewPrompt;
    document.getElementById('btn-compare-trigger').onclick = openCompareModal;
    document.getElementById('btn-close-compare').onclick = () => document.getElementById('compare-modal').classList.add('hidden');
    document.getElementById('btn-bulk-ai').onclick = () => document.getElementById('bulk-ai-modal').classList.remove('hidden');
    document.getElementById('btn-close-bulk').onclick = () => document.getElementById('bulk-ai-modal').classList.add('hidden');
    document.getElementById('btn-apply-bulk').onclick = applyBulkUpdate;
    document.getElementById('btn-save-property').onclick = saveCurrentProperty;
    document.getElementById('btn-back-grid').onclick = closeEditor;
    document.getElementById('btn-delete-property').onclick = () => {
        if (confirm("Delete?")) { propertyData = propertyData.filter(p => p.id !== currentPropId); saveProperties(); closeEditor(); }
    };
    document.getElementById('btn-copy-ai').onclick = copySinglePrompt;
    document.getElementById('btn-apply-ai').onclick = applySingleAIUpdate;
    document.getElementById('btn-export-csv').onclick = exportToCSV;
    document.getElementById('btn-import-csv-trigger').onclick = () => document.getElementById('csv-upload').click();
    document.getElementById('csv-upload').onchange = handleCSVImport;
    ['prop-price', 'prop-tax', 'prop-carryUtils', 'calc-mortgage', 'calc-rate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = calculateMonthlyCost;
    });
}

function injectFilterBar() {
    const container = document.getElementById('filter-bar-container');
    if (!container || document.getElementById('filter-bar-area')) return;

    container.innerHTML = `<div id="filter-bar-area" style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;">
        <input type="text" id="filter-search" placeholder="🔍 Search..." style="padding:10px; flex:1; border:1px solid #ccc; border-radius:8px; min-width:150px;">
        <select id="filter-city" style="padding:10px; border:1px solid #ccc; border-radius:8px;"><option value="All">All Cities</option></select>
        <select id="filter-sort" style="padding:10px; border:1px solid #ccc; border-radius:8px;">
            <option value="newest">Sort: Newest</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="status">Status</option>
        </select>
    </div>`;

    document.getElementById('filter-search').oninput = applyFilters;
    document.getElementById('filter-city').onchange = applyFilters;
    document.getElementById('filter-sort').onchange = applyFilters;
    updateCityDropdown();
}

function updateCityDropdown() {
    const sel = document.getElementById('filter-city');
    if (!sel) return;
    const cities = [...new Set(propertyData.map(p => p.city || ""))].filter(c => c).sort();
    sel.innerHTML = '<option value="All">All Cities</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
}

function applyFilters() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const city = document.getElementById('filter-city').value;
    const sortBy = document.getElementById('filter-sort').value;

    let filtered = propertyData.filter(p =>
        (p.address + p.title + p.mls).toLowerCase().includes(search) &&
        (city === "All" || p.city === city)
    );

    if (sortBy === 'price-desc') {
        filtered.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
    } else if (sortBy === 'price-asc') {
        filtered.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    } else if (sortBy === 'status') {
        filtered.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
    } else if (sortBy === 'newest') {
        filtered.sort((a, b) => new Date(b.importDate || 0) - new Date(a.importDate || 0));
    }

    renderGrid(filtered);
}

function renderGrid(data = propertyData) {
    const grid = document.getElementById('property-grid-view');
    grid.innerHTML = '';
    if (data.length === 0) { grid.innerHTML = '<p style="width:100%; text-align:center; color:#666;">No properties found.</p>'; return; }
    data.forEach(p => {
        const card = document.createElement('div');
        card.className = `property-card status-${p.status}`;

        // FEATURE 2: Added Suite Badge to Card
        const suiteBadge = (p.suite && p.suite !== 'No')
            ? `<span style="background:#fff3e0; color:#e65100; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-left:5px; border:1px solid #ffe0b2;">Suite: ${p.suite}</span>`
            : '';

        const imgHtml = p.img
            ? `<div class="card-img-container"><img src="${p.img}" class="card-img" alt="Property"></div>`
            : `<div class="card-img-container" style="display:flex;align-items:center;justify-content:center;color:#ccc;">🏠 No Photo</div>`;
        card.innerHTML = `
            <input type="checkbox" class="card-select" value="${p.id}" onclick="event.stopPropagation()">
            ${imgHtml}
            <div class="card-content" onclick="openProperty('${p.id}')">
                <h3 style="margin-top:0;">${p.title || p.address || 'Untitled'}</h3>
                <div class="card-stats">
                    <span>$${parseInt(p.price || 0).toLocaleString()}</span>
                    <span>📍 ${p.city || 'Unknown'}</span>
                </div>
                <div style="margin-top:5px; font-size:0.9em; color:#666;">
                    ${p.bed || '-'} bds • ${p.bath || '-'} ba ${suiteBadge}
                </div>
                <div class="ai-badge">${p.status}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}