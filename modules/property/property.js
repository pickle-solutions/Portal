// Global State
let propertyData = [];
let currentPropId = null;

/**
 * Initializes the property module
 */
function initPropertyModule() {
    console.log('Property Module Loaded');
    loadProperties();
    setupEventListeners();
    injectFilterBar();
    renderGrid();
}

// --- Data Management ---

function loadProperties() {
    const stored = localStorage.getItem('portal_properties');
    if (stored) {
        propertyData = JSON.parse(stored);
    } else {
        propertyData = [];
    }
}

function saveProperties() {
    localStorage.setItem('portal_properties', JSON.stringify(propertyData));
    renderGrid();
    updateCityDropdown();
}

// --- Logic & Calculations ---

/**
 * Calculates current Days on Market based on the initial import
 */
function getLiveDOM(prop) {
    if (prop.importDate && prop.dom !== undefined) {
        const importTime = new Date(prop.importDate).getTime();
        const nowTime = new Date().getTime();
        const diffDays = Math.floor((nowTime - importTime) / (1000 * 60 * 60 * 24));
        return parseInt(prop.dom) + diffDays;
    }
    return prop.dom || 0;
}

/**
 * Calculates total monthly carry cost including mortgage, tax, and utilities
 */
function calculateMonthlyCost() {
    const principal = parseFloat(document.getElementById('calc-mortgage-amt').value) || 0;
    const rate = parseFloat(document.getElementById('calc-rate').value) || 0;
    const annualTax = parseFloat(document.getElementById('prop-tax').value) || 0;
    const monthlyUtils = parseFloat(document.getElementById('prop-carry-utils').value) || 0;

    let mortgagePayment = 0;
    if (principal > 0 && rate > 0) {
        const r = rate / 100 / 12;
        const n = 25 * 12; // Defaulting to 25 year amortization
        mortgagePayment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }

    const monthlyTax = annualTax / 12;
    const total = mortgagePayment + monthlyTax + monthlyUtils;

    document.getElementById('calc-result').innerText =
        `Mortgage: $${Math.round(mortgagePayment)} + Tax: $${Math.round(monthlyTax)} + Utils: $${Math.round(monthlyUtils)} = Total: $${Math.round(total)}/mo`;
}

// --- AI Integration Functions ---

/**
 * Copies the current property data and a prompt for an AI assistant
 */
function copyForAI() {
    const prop = propertyData.find(p => p.id === currentPropId);
    if (!prop) {
        alert("Please save the property first before copying for AI.");
        return;
    }

    const aiPrompt = `
I have a real estate listing I am tracking. Please research the area and listing details for the following address and return ONLY a JSON code block with these keys:
"title" (a short nickname), "city", "houseSize" (sqft number), "landSize", "power" (amps), "water" (well/city), "riskFire" (1-5), "riskClimate" (1-5), "distCity" (km), "distGrocery" (km), "distHospital" (km), "tax" (annual), "carryUtils" (est. monthly).

Address: ${prop.address}
MLS: ${prop.mls}
URL: ${prop.url}
    `;

    navigator.clipboard.writeText(aiPrompt).then(() => {
        alert("AI Prompt and Data copied to clipboard! Paste this into ChatGPT or Gemini.");
    });
}

/**
 * Takes the JSON output from an AI and maps it to the form fields
 */
function applyAIUpdate() {
    const input = document.getElementById('ai-update-input').value;
    try {
        const aiData = JSON.parse(input);

        // Map JSON keys to HTML Input IDs
        const mapping = {
            'title': 'prop-title',
            'city': 'prop-city-manual',
            'houseSize': 'prop-house-size',
            'landSize': 'prop-land-size',
            'power': 'prop-power',
            'water': 'prop-water',
            'riskFire': 'prop-risk-fire',
            'riskClimate': 'prop-risk-climate',
            'distCity': 'prop-dist-city',
            'distGrocery': 'prop-dist-grocery',
            'distHospital': 'prop-dist-hospital',
            'tax': 'prop-tax',
            'carryUtils': 'prop-carry-utils'
        };

        for (let key in mapping) {
            if (aiData[key] !== undefined) {
                document.getElementById(mapping[key]).value = aiData[key];
            }
        }

        alert("AI Data Applied! Review the fields and click Save.");
        calculateMonthlyCost();
    } catch (e) {
        alert("Invalid JSON. Please ensure you copied the entire code block from the AI.");
    }
}

// --- Filter Bar Logic ---

function injectFilterBar() {
    if (document.getElementById('filter-bar-area')) return;

    const controlBar = document.querySelector('.property-controls');
    const filterContainer = document.createElement('div');
    filterContainer.id = 'filter-bar-area';
    filterContainer.style.cssText = `
        display: flex; gap: 10px; align-items: center; background: #f8f9fa; 
        padding: 10px; border-radius: 8px; margin-top: 10px; flex-wrap: wrap; border: 1px solid #ddd;
    `;

    filterContainer.innerHTML = `
        <input type="text" id="filter-search" placeholder="🔍 Search address, title..." style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; flex: 1;">
        <select id="filter-city" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"><option value="All">All Cities</option></select>
        <select id="filter-sort" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <option value="newest">Sort: Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
        </select>
        <span id="filter-stats" style="font-size: 0.85em; color: #666; margin-left: auto;"></span>
    `;

    controlBar.after(filterContainer);

    document.getElementById('filter-search').addEventListener('input', applyFilters);
    document.getElementById('filter-city').addEventListener('change', applyFilters);
    document.getElementById('filter-sort').addEventListener('change', applyFilters);

    updateCityDropdown();
}

function updateCityDropdown() {
    const citySelect = document.getElementById('filter-city');
    if (!citySelect) return;
    const cities = [...new Set(propertyData.map(p => p.city || (p.address?.split(',')[1] || "Unknown").trim()))].sort();
    const currentVal = citySelect.value;
    citySelect.innerHTML = '<option value="All">All Cities</option>';
    cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.innerText = c;
        citySelect.appendChild(opt);
    });
    citySelect.value = currentVal;
}

function applyFilters() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const city = document.getElementById('filter-city').value;
    const sortMode = document.getElementById('filter-sort').value;

    let filtered = propertyData.filter(p => {
        const searchStr = (p.address + (p.title || "") + (p.mls || "")).toLowerCase();
        const matchesSearch = searchStr.includes(search);
        const pCity = p.city || (p.address?.split(',')[1] || "").trim();
        const matchesCity = city === "All" || pCity === city;
        return matchesSearch && matchesCity;
    });

    if (sortMode === 'price_asc') filtered.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    else if (sortMode === 'price_desc') filtered.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
    else filtered.sort((a, b) => new Date(b.importDate) - new Date(a.importDate));

    renderGrid(filtered);
    document.getElementById('filter-stats').innerText = `${filtered.length} Props`;
}

// --- DOM Rendering ---

function renderGrid(dataToRender = propertyData) {
    const grid = document.getElementById('property-grid-view');
    grid.innerHTML = '';

    if (dataToRender.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">No properties found.</p>';
        return;
    }

    dataToRender.forEach(prop => {
        const card = document.createElement('div');
        card.className = `property-card status-${prop.status.replace(/\s+/g, '')}`;
        card.onclick = () => openProperty(prop.id);

        const displayTitle = prop.title || prop.address || 'Untitled';
        const displayCity = prop.city || (prop.address?.split(',')[1] || "Unknown").trim();

        card.innerHTML = `
            <div class="card-header">
                <h3>${displayTitle}</h3>
                <small>${prop.address || 'No Address'}</small>
            </div>
            <div class="card-stats">
                <span>$${(parseInt(prop.price) || 0).toLocaleString()}</span>
                <span>${displayCity}</span>
            </div>
            <div class="ai-badge">${prop.status} (${getLiveDOM(prop)}d)</div>
        `;
        grid.appendChild(card);
    });
}

// --- Editor Logic ---

function openProperty(id) {
    const prop = id ? propertyData.find(p => p.id === id) : {
        id: Date.now().toString(),
        importDate: new Date().toISOString(),
        status: 'Watchlist'
    };
    currentPropId = prop.id;

    // Fill Fields
    document.getElementById('prop-title').value = prop.title || '';
    document.getElementById('prop-mls').value = prop.mls || '';
    document.getElementById('prop-status').value = prop.status || 'Watchlist';
    document.getElementById('prop-address').value = prop.address || '';
    document.getElementById('prop-city-manual').value = prop.city || '';
    document.getElementById('prop-url').value = prop.url || '';
    document.getElementById('prop-dom-imported').value = prop.dom || 0;
    document.getElementById('prop-date-imported').value = prop.importDate;
    document.getElementById('prop-display-dom').value = getLiveDOM(prop);

    document.getElementById('prop-house-size').value = prop.houseSize || '';
    document.getElementById('prop-land-size').value = prop.landSize || '';
    document.getElementById('prop-zoning').value = prop.zoning || '';
    document.getElementById('prop-power').value = prop.power || '';
    document.getElementById('prop-water').value = prop.water || '';
    document.getElementById('prop-features').value = prop.features || '';

    document.getElementById('prop-risk-fire').value = prop.riskFire || '';
    document.getElementById('prop-risk-climate').value = prop.riskClimate || '';
    document.getElementById('prop-dist-city').value = prop.distCity || '';
    document.getElementById('prop-dist-grocery').value = prop.distGrocery || '';
    document.getElementById('prop-dist-hospital').value = prop.distHospital || '';

    document.getElementById('prop-price').value = prop.price || '';
    document.getElementById('prop-tax').value = prop.tax || '';
    document.getElementById('prop-carry-utils').value = prop.carryUtils || '';
    document.getElementById('calc-mortgage-amt').value = prop.mortgageAmt || prop.price || '';

    // Ratings
    document.getElementById('rate-user-loc').value = prop.ratings?.user?.loc || '';
    document.getElementById('note-user').value = prop.ratings?.user?.note || '';
    document.getElementById('rate-spouse-loc').value = prop.ratings?.spouse?.loc || '';
    document.getElementById('note-spouse').value = prop.ratings?.spouse?.note || '';
    document.getElementById('rate-realtor-loc').value = prop.ratings?.realtor?.loc || '';
    document.getElementById('note-realtor').value = prop.ratings?.realtor?.note || '';

    const linkBtn = document.getElementById('link-external');
    if (prop.url) { linkBtn.href = prop.url; linkBtn.style.display = 'inline-block'; }
    else { linkBtn.style.display = 'none'; }

    calculateMonthlyCost();
    document.getElementById('property-grid-view').classList.add('hidden');
    document.getElementById('property-detail-view').classList.remove('hidden');
    document.querySelector('.property-controls').classList.add('hidden');
    if (document.getElementById('filter-bar-area')) document.getElementById('filter-bar-area').style.display = 'none';
}

function saveCurrentProperty() {
    const updated = {
        id: currentPropId,
        title: document.getElementById('prop-title').value,
        mls: document.getElementById('prop-mls').value,
        status: document.getElementById('prop-status').value,
        address: document.getElementById('prop-address').value,
        city: document.getElementById('prop-city-manual').value,
        url: document.getElementById('prop-url').value,
        dom: document.getElementById('prop-dom-imported').value,
        importDate: document.getElementById('prop-date-imported').value,
        houseSize: document.getElementById('prop-house-size').value,
        landSize: document.getElementById('prop-land-size').value,
        zoning: document.getElementById('prop-zoning').value,
        power: document.getElementById('prop-power').value,
        water: document.getElementById('prop-water').value,
        features: document.getElementById('prop-features').value,
        riskFire: document.getElementById('prop-risk-fire').value,
        riskClimate: document.getElementById('prop-risk-climate').value,
        distCity: document.getElementById('prop-dist-city').value,
        distGrocery: document.getElementById('prop-dist-grocery').value,
        distHospital: document.getElementById('prop-dist-hospital').value,
        price: document.getElementById('prop-price').value,
        tax: document.getElementById('prop-tax').value,
        carryUtils: document.getElementById('prop-carry-utils').value,
        mortgageAmt: document.getElementById('calc-mortgage-amt').value,
        ratings: {
            user: { loc: document.getElementById('rate-user-loc').value, note: document.getElementById('note-user').value },
            spouse: { loc: document.getElementById('rate-spouse-loc').value, note: document.getElementById('note-spouse').value },
            realtor: { loc: document.getElementById('rate-realtor-loc').value, note: document.getElementById('note-realtor').value }
        }
    };

    const index = propertyData.findIndex(p => p.id === currentPropId);
    if (index >= 0) propertyData[index] = updated;
    else propertyData.push(updated);

    saveProperties();
    closeEditor();
}

function closeEditor() {
    document.getElementById('property-detail-view').classList.add('hidden');
    document.getElementById('property-grid-view').classList.remove('hidden');
    document.querySelector('.property-controls').classList.remove('hidden');
    if (document.getElementById('filter-bar-area')) document.getElementById('filter-bar-area').style.display = 'flex';
    applyFilters();
}

function deleteCurrentProperty() {
    if (confirm('Delete this property?')) {
        propertyData = propertyData.filter(p => p.id !== currentPropId);
        saveProperties();
        closeEditor();
    }
}

// --- Clipboard Support ---

async function pastePropertyFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        let data = JSON.parse(text);
        if (!data.mls && !data.address) { alert("Invalid property data."); return; }

        const id = Date.now().toString();
        const finalProp = {
            ...data,
            id: id,
            importDate: new Date().toISOString(),
            status: 'Watchlist'
        };

        propertyData.push(finalProp);
        saveProperties();
        alert(`Imported: ${data.address || data.mls}`);
    } catch (err) {
        alert("Clipboard error: " + err);
    }
}

// --- Events ---

function setupEventListeners() {
    document.getElementById('btn-add-property').addEventListener('click', () => openProperty(null));
    document.getElementById('btn-save-property').addEventListener('click', saveCurrentProperty);
    document.getElementById('btn-back-grid').addEventListener('click', closeEditor);
    document.getElementById('btn-delete-property').addEventListener('click', deleteCurrentProperty);
    document.getElementById('btn-paste-property').addEventListener('click', pastePropertyFromClipboard);

    // AI Helpers
    document.getElementById('btn-copy-ai').addEventListener('click', copyForAI);
    document.getElementById('btn-apply-ai').addEventListener('click', applyAIUpdate);

    // Dynamic Calculations
    const calcInputs = ['calc-mortgage-amt', 'calc-rate', 'prop-tax', 'prop-carry-utils'];
    calcInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', calculateMonthlyCost);
    });
}