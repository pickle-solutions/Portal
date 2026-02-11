// Global State
let propertyData = [];
let currentPropId = null;

function initPropertyModule() {
    console.log('Property Module Loaded');
    loadProperties();
    setupEventListeners();
    injectFilterBar(); // New: Replaces the old sort buttons
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
    updateCityDropdown(); // Update filter options when data changes
}

// --- New: Professional Filter Bar ---
function injectFilterBar() {
    if (document.getElementById('filter-bar-area')) return;

    const controlBar = document.querySelector('.property-controls');

    // Create the main container
    const filterContainer = document.createElement('div');
    filterContainer.id = 'filter-bar-area';
    filterContainer.style.cssText = `
        display: flex; 
        gap: 10px; 
        align-items: center; 
        background: #f8f9fa; 
        padding: 10px; 
        border-radius: 8px; 
        margin-top: 10px; 
        flex-wrap: wrap;
        border: 1px solid #ddd;
    `;

    // 1. Search Box
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.id = 'filter-search';
    searchBox.placeholder = '🔍 Search address, features...';
    searchBox.style.cssText = 'padding: 8px; border: 1px solid #ccc; border-radius: 4px; flex: 1;';

    // 2. City Dropdown
    const citySelect = document.createElement('select');
    citySelect.id = 'filter-city';
    citySelect.style.cssText = 'padding: 8px; border: 1px solid #ccc; border-radius: 4px;';
    citySelect.innerHTML = '<option value="All">All Cities</option>';

    // 3. Suite Toggle
    const suiteLabel = document.createElement('label');
    suiteLabel.style.cssText = 'display: flex; align-items: center; gap: 5px; cursor: pointer; font-weight: 500;';
    suiteLabel.innerHTML = `<input type="checkbox" id="filter-suite"> 🏠 Suites Only`;

    // 4. Sort Dropdown
    const sortSelect = document.createElement('select');
    sortSelect.id = 'filter-sort';
    sortSelect.style.cssText = 'padding: 8px; border: 1px solid #ccc; border-radius: 4px;';
    sortSelect.innerHTML = `
        <option value="newest">Sort: Newest</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
    `;

    // 5. Stats Counter
    const stats = document.createElement('span');
    stats.id = 'filter-stats';
    stats.style.cssText = 'font-size: 0.85em; color: #666; margin-left: auto;';
    stats.innerText = `${propertyData.length} Props`;

    // Append All
    filterContainer.appendChild(searchBox);
    filterContainer.appendChild(citySelect);
    filterContainer.appendChild(suiteLabel);
    filterContainer.appendChild(sortSelect);
    filterContainer.appendChild(stats);

    controlBar.after(filterContainer);

    // Add Event Listeners
    searchBox.addEventListener('input', applyFilters);
    citySelect.addEventListener('change', applyFilters);
    document.getElementById('filter-suite').addEventListener('change', applyFilters);
    sortSelect.addEventListener('change', applyFilters);

    updateCityDropdown();
}

function updateCityDropdown() {
    const citySelect = document.getElementById('filter-city');
    if (!citySelect) return;

    // Extract unique cities
    const cities = [...new Set(propertyData.map(p => p.city || (p.address.split(',')[1] || "Unknown").trim()))].sort();

    const currentVal = citySelect.value;
    citySelect.innerHTML = '<option value="All">All Cities</option>';

    cities.forEach(c => {
        if (c) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = c;
            citySelect.appendChild(opt);
        }
    });
    citySelect.value = currentVal; // Restore selection if possible
}

function applyFilters() {
    const search = document.getElementById('filter-search').value.toLowerCase();
    const city = document.getElementById('filter-city').value;
    const onlySuites = document.getElementById('filter-suite').checked;
    const sortMode = document.getElementById('filter-sort').value;

    // Filter
    let filtered = propertyData.filter(p => {
        const matchesSearch = (p.address + p.features + p.mls).toLowerCase().includes(search);
        const matchesCity = city === "All" || (p.city || (p.address.split(',')[1] || "").trim()) === city;
        const matchesSuite = !onlySuites || p.suite === "Yes";
        return matchesSearch && matchesCity && matchesSuite;
    });

    // Sort
    if (sortMode === 'price_asc') {
        filtered.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    } else if (sortMode === 'price_desc') {
        filtered.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
    } else { // Newest
        filtered.sort((a, b) => new Date(b.importDate) - new Date(a.importDate));
    }

    renderGrid(filtered);
    document.getElementById('filter-stats').innerText = `Showing ${filtered.length} of ${propertyData.length}`;
}

// --- Logic Engines ---
function getLiveDOM(prop) {
    if (prop.importDate && prop.dom !== undefined) {
        const importTime = new Date(prop.importDate).getTime();
        const nowTime = new Date().getTime();
        const diffDays = Math.floor((nowTime - importTime) / (1000 * 60 * 60 * 24));
        return parseInt(prop.dom) + diffDays;
    }
    return prop.dom || 0;
}

function calculateMonthlyCost() {
    const principal = parseFloat(document.getElementById('calc-mortgage-amt').value) || 0;
    const rate = parseFloat(document.getElementById('calc-rate').value) || 0;
    const years = parseFloat(document.getElementById('calc-years').value) || 0;
    const annualTax = parseFloat(document.getElementById('prop-tax').value) || 0;

    let mortgagePayment = 0;
    if (principal > 0 && rate > 0 && years > 0) {
        const r = rate / 100 / 12;
        const n = years * 12;
        mortgagePayment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }
    const monthlyTax = annualTax / 12;
    const total = mortgagePayment + monthlyTax;

    document.getElementById('calc-result').innerText =
        `Mortgage: $${Math.round(mortgagePayment)} + Tax: $${Math.round(monthlyTax)} = Total: $${Math.round(total)}/mo`;
}

// --- DOM Rendering ---
function renderGrid(dataToRender = propertyData) {
    const grid = document.getElementById('property-grid-view');
    grid.innerHTML = '';

    if (dataToRender.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column: 1/-1;">No properties match your filter.</p>';
        return;
    }

    dataToRender.forEach(prop => {
        const liveDOM = getLiveDOM(prop);
        const card = document.createElement('div');
        card.className = `property-card status-${prop.status}`;
        card.onclick = () => openProperty(prop.id);

        let priceDisplay = prop.price ? `$${parseInt(prop.price).toLocaleString()}` : '$-';

        let suiteBadge = "";
        if (prop.suite === "Yes") {
            suiteBadge = `<span style="background:#d1fae5; color:#065f46; padding:2px 6px; border-radius:4px; font-size:0.8em; margin-left:5px; border:1px solid #a7f3d0;">🏠 Suite</span>`;
        }

        let cityDisplay = prop.city || (prop.address.split(',')[1] || "").trim();

        card.innerHTML = `
            <div class="card-header">
                <h3>${prop.address || 'Unknown'}</h3>
                <small>${prop.mls || 'No MLS'}</small>
            </div>
            <div class="card-stats">
                <span>${priceDisplay}</span>
                <span>${cityDisplay}</span>
            </div>
            <div style="font-size: 0.9em; color: #555; margin-top: 8px; display:flex; align-items:center;">
                <span style="margin-right:8px;">🛏️ ${prop.bed || '-'}</span>
                <span style="margin-right:8px;">🛁 ${prop.bath || '-'}</span>
                ${suiteBadge}
            </div>
            <div class="ai-badge">${prop.status || 'Active'} (${liveDOM}d)</div>
        `;
        grid.appendChild(card);
    });
}

// --- Editor Logic (Preserved from previous versions) ---
function openProperty(id) {
    const prop = id ? propertyData.find(p => p.id === id) : {
        id: Date.now().toString(),
        ratings: { user: {}, spouse: {}, realtor: {} },
        importDate: new Date().toISOString()
    };
    currentPropId = prop.id;

    // Fields
    document.getElementById('prop-mls').value = prop.mls || '';
    document.getElementById('prop-status').value = prop.status || 'Active';
    document.getElementById('prop-address').value = prop.address || '';
    document.getElementById('prop-url').value = prop.url || '';
    document.getElementById('prop-dom-imported').value = prop.dom || 0;
    document.getElementById('prop-date-imported').value = prop.importDate || new Date().toISOString();
    document.getElementById('prop-display-dom').value = getLiveDOM(prop);
    document.getElementById('prop-house-size').value = prop.houseSize || '';
    document.getElementById('prop-land-size').value = prop.landSize || '';
    document.getElementById('prop-zoning').value = prop.zoning || '';
    document.getElementById('prop-features').value = prop.features || '';
    document.getElementById('prop-price').value = prop.price || '';
    document.getElementById('prop-assessment').value = prop.assessment || '';
    document.getElementById('prop-tax').value = prop.tax || '';
    document.getElementById('calc-mortgage-amt').value = prop.mortgageAmt || prop.price || '';
    document.getElementById('rate-user-loc').value = prop.ratings?.user?.loc || '';
    document.getElementById('note-user').value = prop.ratings?.user?.note || '';
    document.getElementById('rate-spouse-loc').value = prop.ratings?.spouse?.loc || '';
    document.getElementById('note-spouse').value = prop.ratings?.spouse?.note || '';
    document.getElementById('rate-realtor-loc').value = prop.ratings?.realtor?.loc || '';
    document.getElementById('note-realtor').value = prop.ratings?.realtor?.note || '';

    const linkBtn = document.getElementById('link-external');
    if (prop.url) {
        linkBtn.href = prop.url;
        linkBtn.style.display = 'inline-flex';
    } else {
        linkBtn.style.display = 'none';
    }

    calculateMonthlyCost();
    document.getElementById('property-grid-view').classList.add('hidden');
    document.getElementById('property-detail-view').classList.remove('hidden');
    document.querySelector('.property-controls').classList.add('hidden');

    // Hide Filter Bar while editing
    const filterBar = document.getElementById('filter-bar-area');
    if (filterBar) filterBar.style.display = 'none';
}

function saveCurrentProperty() {
    const existing = propertyData.find(p => p.id === currentPropId) || {};
    const newProp = {
        ...existing,
        id: currentPropId,
        mls: document.getElementById('prop-mls').value,
        status: document.getElementById('prop-status').value,
        address: document.getElementById('prop-address').value,
        url: document.getElementById('prop-url').value,
        dom: document.getElementById('prop-dom-imported').value,
        importDate: document.getElementById('prop-date-imported').value,
        houseSize: document.getElementById('prop-house-size').value,
        landSize: document.getElementById('prop-land-size').value,
        zoning: document.getElementById('prop-zoning').value,
        features: document.getElementById('prop-features').value,
        price: document.getElementById('prop-price').value,
        assessment: document.getElementById('prop-assessment').value,
        tax: document.getElementById('prop-tax').value,
        mortgageAmt: document.getElementById('calc-mortgage-amt').value,
        ratings: {
            user: { loc: document.getElementById('rate-user-loc').value, note: document.getElementById('note-user').value },
            spouse: { loc: document.getElementById('rate-spouse-loc').value, note: document.getElementById('note-spouse').value },
            realtor: { loc: document.getElementById('rate-realtor-loc').value, note: document.getElementById('note-realtor').value }
        }
    };

    const index = propertyData.findIndex(p => p.id === currentPropId);
    if (index >= 0) propertyData[index] = newProp;
    else propertyData.push(newProp);

    saveProperties();
    closeEditor();
}

function closeEditor() {
    document.getElementById('property-detail-view').classList.add('hidden');
    document.getElementById('property-grid-view').classList.remove('hidden');
    document.querySelector('.property-controls').classList.remove('hidden');

    // Show Filter Bar again
    const filterBar = document.getElementById('filter-bar-area');
    if (filterBar) filterBar.style.display = 'flex';

    // Re-apply filters to grid
    applyFilters();
}

// ... (Import/Export/EventListeners remain same as previous, included implicitly) ...
function deleteCurrentProperty() {
    if (confirm('Delete this property?')) {
        propertyData = propertyData.filter(p => p.id !== currentPropId);
        saveProperties();
        closeEditor();
    }
}
async function pastePropertyFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        let data;
        try { data = JSON.parse(text); } catch (e) { alert("Invalid Clipboard Data"); return; }
        if (!data.mls) { alert("Data missing MLS."); return; }

        const existing = propertyData.find(p => p.mls === data.mls);
        const id = existing ? existing.id : Date.now().toString();

        const finalProp = {
            ...existing,
            ...data,
            id: id,
            importDate: existing ? existing.importDate : new Date().toISOString(),
            status: existing ? existing.status : 'Active',
            ratings: existing ? existing.ratings : { user: {}, spouse: {}, realtor: {} }
        };

        if (existing) {
            const idx = propertyData.findIndex(p => p.id === id);
            propertyData[idx] = finalProp;
        } else {
            propertyData.push(finalProp);
        }

        saveProperties();
        updateCityDropdown(); // Update cities list on new paste
        alert(`Imported: ${data.address}\nCity: ${data.city}`);
        renderGrid(); // Refresh grid immediately
    } catch (err) {
        alert("Clipboard error: " + err);
    }
}

function setupEventListeners() {
    document.getElementById('btn-add-property').addEventListener('click', () => openProperty(null));
    document.getElementById('btn-paste-property').addEventListener('click', pastePropertyFromClipboard);
    document.getElementById('btn-back-grid').addEventListener('click', closeEditor);
    document.getElementById('btn-save-property').addEventListener('click', saveCurrentProperty);
    document.getElementById('btn-delete-property').addEventListener('click', deleteCurrentProperty);
    // Export/Import Listeners would go here if needed
}