function initListerModule() {

    // --- 1. PREVENT DUPLICATE GLOBAL LISTENERS ---
    if (!window.listerGlobalListenersAttached) {

        // Global Drop Protection
        window.addEventListener("dragover", (e) => {
            if (!document.getElementById('lister-form-view')) return;
            e.preventDefault();
        }, false);

        window.addEventListener("drop", (e) => {
            if (!document.getElementById('lister-form-view')) return;
            e.preventDefault();
        }, false);
        // ==========================================
        // ⛔️ CRITICAL: IMAGE HANDLING LOGIC (PASTE)
        // DO NOT TOUCH
        // ==========================================
        // Global Paste Support
        document.addEventListener('paste', (e) => {
            const formView = document.getElementById('lister-form-view');
            if (!formView || formView.classList.contains('is-hidden')) return;

            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            let foundImage = false;
            const photoInput = document.getElementById('lister-photo-input');

            if (photoInput) {
                for (const item of items) {
                    if (item.type.indexOf("image") === 0) {
                        const blob = item.getAsFile();
                        const fileList = new DataTransfer();
                        fileList.items.add(blob);
                        photoInput.files = fileList.files;
                        photoInput.dispatchEvent(new Event('change'));
                        foundImage = true;
                    }
                }
            }
            if (foundImage) showToast("Image Pasted!");
        });
        // ==========================================
        // ⛔️ END PROTECTED ZONE
        // ==========================================

        window.listerGlobalListenersAttached = true;
    }

    // --- UUID HELPER (Timestamp + Random) ---
    function generateUUID() {
        return `${Date.now()}-${self.crypto.randomUUID()}`;
    }

    // --- 2. DATABASE ---
    const listerDB = {
        db: null, dbName: 'ListerDatabase', itemStoreName: 'masterItems', listingStoreName: 'listings',
        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(listerDB.dbName, 6);
                request.onsuccess = (e) => { listerDB.db = e.target.result; resolve(); };
                request.onerror = (e) => reject(e);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(listerDB.itemStoreName)) db.createObjectStore(listerDB.itemStoreName, { keyPath: 'id', autoIncrement: true });
                    if (!db.objectStoreNames.contains(listerDB.listingStoreName)) {
                        const s = db.createObjectStore(listerDB.listingStoreName, { keyPath: 'id', autoIncrement: true });
                        s.createIndex('itemId', 'itemId', { unique: false });
                    }
                };
            });
        },
        async saveItem(item) {
            return new Promise((resolve, reject) => {
                const tx = listerDB.db.transaction([listerDB.itemStoreName], 'readwrite');
                const req = tx.objectStore(listerDB.itemStoreName).put(item);
                req.onsuccess = () => resolve(req.result);
                req.onerror = (e) => reject(e);
            });
        },
        async getAllItems() {
            return new Promise((resolve) => {
                const tx = listerDB.db.transaction([listerDB.itemStoreName], 'readonly');
                const req = tx.objectStore(listerDB.itemStoreName).getAll();
                req.onsuccess = () => resolve(req.result);
            });
        },
        async getItem(id) {
            return new Promise((resolve) => {
                const tx = listerDB.db.transaction([listerDB.itemStoreName], 'readonly');
                const req = tx.objectStore(listerDB.itemStoreName).get(id);
                req.onsuccess = () => resolve(req.result);
            });
        },
        async deleteItem(id) {
            return new Promise((resolve) => {
                const tx = listerDB.db.transaction([listerDB.itemStoreName], 'readwrite');
                tx.objectStore(listerDB.itemStoreName).delete(id).onsuccess = () => resolve();
            });
        },
        async saveListing(listing) {
            return new Promise((resolve) => {
                const tx = listerDB.db.transaction([listerDB.listingStoreName], 'readwrite');
                tx.objectStore(listerDB.listingStoreName).put(listing).onsuccess = () => resolve();
            });
        },
        async getAllListings() {
            return new Promise((resolve) => {
                const tx = listerDB.db.transaction([listerDB.listingStoreName], 'readonly');
                tx.objectStore(listerDB.listingStoreName).getAll().onsuccess = (e) => resolve(e.target.result);
            });
        },
        async deleteListing(id) {
            return new Promise((resolve) => {
                const tx = listerDB.db.transaction([listerDB.listingStoreName], 'readwrite');
                tx.objectStore(listerDB.listingStoreName).delete(id).onsuccess = () => resolve();
            });
        },
        async deleteListingsForItem(itemId) {
            const listings = await listerDB.getAllListings();
            const toDelete = listings.filter(l => l.itemId === itemId);
            for (let l of toDelete) { await listerDB.deleteListing(l.id); }
        },
        async clearDatabase() {
            return new Promise((resolve, reject) => {
                const tx = listerDB.db.transaction([listerDB.itemStoreName, listerDB.listingStoreName], 'readwrite');
                tx.objectStore(listerDB.itemStoreName).clear();
                tx.objectStore(listerDB.listingStoreName).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        }
    };

    // Helper to show notifications
    function showToast(message) {
        const toast = document.getElementById('lister-toast');
        if (toast) {
            toast.textContent = message;
            toast.className = 'show';
            setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
        }
    }

    const itemForm = document.getElementById('lister-item-form');
    let currentPhotos = []; // Array for ordered photos
    let currentItemForPosting = null;

    // ==========================================
    // ⛔️ CRITICAL: IMAGE HANDLING LOGIC
    // DO NOT MODIFY, REFACTOR, OR DELETE ANYTHING BETWEEN THESE LINES
    // ==========================================

    const imageHandler = initListerImageHandler(
        () => currentPhotos,
        (newPhotos) => { currentPhotos = newPhotos; },
        showToast
    );

    // ==========================================
    // ⛔️ END OF PROTECTED ZONE
    // ==========================================

    // --- CATEGORY MANAGER (STRICT + NO HIDDEN BUNDLES) ---
    async function populateCategoryFilter() {
        const items = await listerDB.getAllItems();
        const select = document.getElementById('lister-filter-category');

        const currentVal = select.value;
        const catSet = new Set();

        // 1. Define what counts as "Available"
        const AVAILABLE_STATUSES = ['Draft', 'Active', 'Pending', 'Inventory', 'Returned'];

        items.forEach(i => {
            // 2. SKIP HIDDEN ITEMS (Items inside bundles)
            if (i.isHidden) return;

            // 3. SKIP SOLD/ARCHIVED (Strict Mode)
            const status = i.status || 'Draft';
            if (AVAILABLE_STATUSES.includes(status)) {
                let c = (i.category || '').trim();
                if (c) catSet.add(c.charAt(0).toUpperCase() + c.slice(1));
            }
        });

        // Sort & Build
        const uniqueCats = [...catSet].sort((a, b) => a.localeCompare(b));

        select.innerHTML = '<option value="all">All Categories</option>';
        uniqueCats.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat; option.textContent = cat;
            select.appendChild(option);
        });

        if (currentVal !== 'all' && uniqueCats.includes(currentVal)) select.value = currentVal;
        else select.value = 'all';
    }
    async function exportToCSV() {
        try {
            const items = await listerDB.getAllItems();
            if (items.length === 0) { showToast("No items to export."); return; }

            // FIX: Filter out Hidden items (Bundle Children) so counts match UI
            const visibleItems = items.filter(i => !i.isHidden);

            // UPDATED HEADERS: Added Invoice, Retail, etc.
            const headers = ["Title", "Status", "List Price", "Sold Price", "Cost", "Retail", "Profit", "Category", "Location", "Condition", "Invoice #", "Tags", "Date Listed"];

            const rows = visibleItems.map(item => {
                const esc = (t) => `"${(t || '').toString().replace(/"/g, '""')}"`;

                const price = parseFloat(item.price) || 0;
                const cost = parseFloat(item.cost) || 0;
                const soldPrice = parseFloat(item.soldPrice) || 0;
                const retail = parseFloat(item.retailPrice) || 0; // NEW

                let profit = 0;
                if (item.status === 'Sold') {
                    profit = soldPrice - cost;
                }

                return [
                    esc(item.title),
                    esc(item.status),
                    price.toFixed(2),
                    soldPrice > 0 ? soldPrice.toFixed(2) : "",
                    cost.toFixed(2),
                    retail > 0 ? retail.toFixed(2) : "", // NEW: Retail Column
                    profit.toFixed(2),
                    esc(item.category),
                    esc(item.location),
                    esc(item.condition),
                    esc(item.invoiceNum), // NEW: Invoice Column
                    esc(item.tags),
                    new Date(item.dateCreated || Date.now()).toLocaleDateString()
                ].join(',');
            });

            const csvContent = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url; link.download = `inventory_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Separate the UI update so it doesn't crash the export if it fails
            try {
                markBackupComplete();
                showToast("CSV Exported!");
            } catch (uiErr) {
                console.error("Backup timestamp failed:", uiErr);
                showToast("Exported (Time not saved)");
            }

        } catch (e) {
            console.error("CSV CRASH:", e);
            alert("Export Error: " + e.message); // Show us the real error
        }
    }
    // --- STATS LOGIC (ULTIMATE VERSION) ---
    async function openStatsModal() {
        const items = await listerDB.getAllItems();

        // Variables to track
        let totalSales = 0;
        let totalCostSold = 0;     // COGS
        let inventoryCost = 0;     // Value of unsold items

        let soldCount = 0;         // Count of Sold
        let activeCount = 0;       // Count of Unsold (Draft, Active, Inv)

        items.forEach(item => {
            const cost = parseFloat(item.cost) || 0;
            const soldPrice = parseFloat(item.soldPrice) || 0;

            // CHECK: Is this a realized sale? 
            // It counts if status is 'Sold' OR if it's 'Archived' but has a price attached.
            const isSold = (item.status === 'Sold') || (item.status === 'Archived' && soldPrice > 0);

            if (isSold) {
                // SOLD ITEMS (Active Sold & Archived Sold)
                totalSales += soldPrice;
                totalCostSold += cost;
                soldCount++;
            } else if (item.status !== 'Archived') {
                // UNSOLD ITEMS (Excluding dead/archived drafts)
                // This catches Draft, Active, Pending, Inventory
                inventoryCost += cost;
                activeCount++;
            }
            // Note: Archived items with $0 sold price are ignored (dead drafts)
        });

        // Calculations
        const netProfit = totalSales - totalCostSold;
        const totalSpend = totalCostSold + inventoryCost; // Sold Cost + Unsold Cost
        const totalItems = soldCount + activeCount;       // Sold Count + Unsold Count

        // Update DOM Elements

        // 1. Profit & Sales
        const profitEl = document.getElementById('stat-net-profit');
        if (profitEl) {
            profitEl.textContent = `$${netProfit.toFixed(2)}`;
            profitEl.style.color = netProfit >= 0 ? '#28a745' : '#dc3545';
        }

        const salesEl = document.getElementById('stat-total-sales');
        if (salesEl) salesEl.textContent = `$${totalSales.toFixed(2)}`;

        // 2. Sold Stats
        const costSoldEl = document.getElementById('stat-cost-sold');
        if (costSoldEl) costSoldEl.textContent = `$${totalCostSold.toFixed(2)}`;

        const countSoldEl = document.getElementById('stat-count-sold');
        if (countSoldEl) countSoldEl.textContent = soldCount;

        // 3. Current Inventory
        const invCostEl = document.getElementById('stat-inventory-cost');
        if (invCostEl) invCostEl.textContent = `$${inventoryCost.toFixed(2)}`;

        const countLeftEl = document.getElementById('stat-count-left');
        if (countLeftEl) countLeftEl.textContent = activeCount;

        // 4. Lifetime Totals
        const totalSpendEl = document.getElementById('stat-total-spend');
        if (totalSpendEl) totalSpendEl.textContent = `$${totalSpend.toFixed(2)}`;

        const totalCountEl = document.getElementById('stat-total-count');
        if (totalCountEl) totalCountEl.textContent = totalItems;

        // Show Modal
        document.getElementById('lister-stats-modal').classList.remove('is-hidden');
    }

    async function handleImport(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const btn = document.getElementById('lister-import-btn');
        btn.textContent = `Importing ${files.length} files...`;
        btn.disabled = true;

        try {
            // Fetch everything we need to prevent duplicates
            const [existingItems, existingListings] = await Promise.all([
                listerDB.getAllItems(),
                listerDB.getAllListings()
            ]);

            // Map Listings for quick duplicate checking (Key: ItemId + URL)
            const linkMap = new Set();
            existingListings.forEach(l => linkMap.add(`${l.itemId}|${l.url}`));

            // Map Items by UUID and Title
            const uuidMap = new Map();
            existingItems.forEach(i => { if (i.uuid) uuidMap.set(i.uuid, i.id); });

            const titleMap = new Map();
            existingItems.forEach(i => titleMap.set(i.title.toLowerCase().trim(), i.id));

            let totalAdded = 0; let totalUpdated = 0;

            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    if (!data.items) continue;

                    for (const item of data.items) {
                        // 1. Process Photos
                        const photos = [];
                        if (item.photos) {
                            for (const b64 of item.photos) {
                                const blob = await imageHandler.base64ToBlob(b64);
                                if (blob) photos.push(blob);
                            }
                        }

                        // 2. Prepare Item Object
                        const newItem = {
                            ...item,
                            photos,
                            price: parseFloat(item.price) || 0,
                            cost: parseFloat(item.cost) || 0,
                            retailPrice: parseFloat(item.retailPrice) || 0, // Import Retail
                            invoiceNum: item.invoiceNum || '' // Import Invoice
                        };

                        // If imported item has no UUID, generate one now to prevent future issues
                        if (!newItem.uuid) newItem.uuid = generateUUID();

                        const normalizedTitle = item.title.toLowerCase().trim();
                        let targetId = null;

                        // 3. Find Match (UUID first, then Title)
                        if (item.uuid && uuidMap.has(item.uuid)) {
                            targetId = uuidMap.get(item.uuid);
                        } else if (titleMap.has(normalizedTitle)) {
                            targetId = titleMap.get(normalizedTitle);
                        }

                        // 4. Save Item (Update or Create)
                        if (targetId) {
                            newItem.id = targetId;
                            await listerDB.saveItem(newItem);
                            totalUpdated++;
                        } else {
                            delete newItem.id;
                            targetId = await listerDB.saveItem(newItem); // Returns new ID
                            if (newItem.uuid) uuidMap.set(newItem.uuid, targetId);
                            titleMap.set(normalizedTitle, targetId);
                            totalAdded++;
                        }

                        // 5. RESTORE LINKS (The Fix for Issue #4)
                        if (item.listings_backup && Array.isArray(item.listings_backup)) {
                            for (const link of item.listings_backup) {
                                // Check if this link already exists for this specific item
                                const uniqueKey = `${targetId}|${link.url}`;
                                if (!linkMap.has(uniqueKey)) {
                                    await listerDB.saveListing({
                                        itemId: targetId, // Link to the NEW Item ID
                                        platform: link.platform,
                                        url: link.url,
                                        date: link.date || new Date().toISOString()
                                    });
                                    linkMap.add(uniqueKey); // Prevent double-adding in same session
                                }
                            }
                        }
                    }
                } catch (err) { console.error(`Error reading file ${file.name}:`, err); }
            }
            showToast(`Import Complete: ${totalAdded} Added, ${totalUpdated} Updated`);
            await populateCategoryFilter();



            renderItemList();
        } catch (err) { alert("Import Error: " + err.message); }
        finally { btn.textContent = 'Import JSON'; btn.disabled = false; e.target.value = ''; }
    }
    // --- INVENTORY LOGIC ---
    // --- INVENTORY LOGIC (SMART MOVE) ---
    async function listOneFromInventory(id) {
        try {
            const item = await listerDB.getItem(id);
            if (!item) return;

            if (item.quantity <= 0) {
                showToast("No inventory left!");
                return;
            }

            // SCENARIO A: It is the LAST ONE. Just move it.
            if (item.quantity === 1) {
                if (confirm("This is the last one. Move entirely to Drafts?")) {
                    item.status = 'Draft';
                    await listerDB.saveItem(item);
                    showToast("Item moved to Drafts!");
                } else {
                    return; // Cancelled
                }
            }
            // SCENARIO B: We have multiples. Split one off.
            else {
                // 1. Reduce Inventory Count
                item.quantity = parseInt(item.quantity) - 1;
                await listerDB.saveItem(item);

                // 2. Create the NEW Selling Item (Draft)
                const newItem = { ...item };
                delete newItem.id;
                newItem.uuid = generateUUID(); // Brand new ID
                newItem.status = 'Draft';      // Ready to sell
                newItem.quantity = 1;          // Selling 1 unit

                // Fix: Ensure we don't accidentally link photos by reference
                if (newItem.photos) newItem.photos = [...newItem.photos];

                await listerDB.saveItem(newItem);
                showToast(`Moved 1 to Drafts! (${item.quantity} left)`);
            }

            await populateCategoryFilter();
            renderItemList();

        } catch (e) {
            console.error(e);
            showToast("Error processing inventory.");
        }
    }


    // --- RENDER ITEMS (UPDATED WITH CHECKBOX & COPY) ---
    // --- RENDER ITEMS (CLEANED) ---
    async function renderItemList() {
        // Fetch Items & Listings
        const [items, allListings] = await Promise.all([listerDB.getAllItems(), listerDB.getAllListings()]);

        // Setup Map for Listings
        const listingsMap = new Map();
        allListings.forEach(l => {
            if (!listingsMap.has(l.itemId)) listingsMap.set(l.itemId, []);
            listingsMap.get(l.itemId).push(l);
        });

        // Get View Elements
        const containerEl = document.getElementById('lister-item-list');
        const itemTemplate = document.getElementById('lister-item-template');

        // Fix: Use correct ID from your HTML file
        const searchInput = document.getElementById('lister-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        const filterStatus = document.getElementById('lister-filter-status').value;
        const filterCategory = document.getElementById('lister-filter-category').value;
        const isGrouped = document.getElementById('lister-group-toggle').checked; // Check Toggle

        // Filter Items
        let filteredItems = items.filter(item => {
            if (item.isHidden) return false;

            const itemStatus = (item.status || 'Draft');
            const matchSearch = item.title.toLowerCase().includes(searchTerm) ||
                (item.tags && item.tags.toLowerCase().includes(searchTerm));

            let matchStatus = true;
            if (filterStatus && filterStatus !== 'All Statuses') {
                matchStatus = itemStatus === filterStatus;
            }

            let itemCat = (item.category || '').trim();
            if (itemCat) itemCat = itemCat.charAt(0).toUpperCase() + itemCat.slice(1);
            const matchCategory = !filterCategory || filterCategory === 'all' || filterCategory === 'All Categories' || itemCat === filterCategory;

            return matchSearch && matchStatus && matchCategory;
        });

        // Sort Newest First
        filteredItems.sort((a, b) => b.id - a.id);

        containerEl.innerHTML = ''; // Clear List

        // --- RENDER HELPER ---
        const renderCard = (item) => {
            const card = itemTemplate.content.cloneNode(true);

            // Checkbox
            let cb = card.querySelector('.lister-item-checkbox');
            cb.dataset.id = item.id;
            cb.checked = selectedItemIds.has(item.id);
            cb.onchange = (e) => toggleSelection(item.id, e.target.checked);

            // Data Binding
            card.querySelector('.lister-item-title').textContent = item.title;

            // Category
            let displayCat = (item.category || 'Uncategorized').trim();
            if (displayCat) displayCat = displayCat.charAt(0).toUpperCase() + displayCat.slice(1);
            card.querySelector('.lister-item-category').textContent = displayCat;
            // --- AGE / DAYS LISTED BADGE ---
            if (item.dateCreated) {
                const start = new Date(item.dateCreated);
                const end = item.status === 'Sold' && item.dateSold ? new Date(item.dateSold) : new Date();
                const diffTime = Math.abs(end - start);
                const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // 1. DRAFTS: Show Nothing (No pressure)
                if (item.status === 'Draft') {
                    // Do nothing
                }

                // 2. INVENTORY: Show Physical Date (Record Tracking)
                else if (item.status === 'Inventory') {
                    const dateStr = start.toLocaleDateString(); // e.g. "12/22/2023"
                    const timeSpan = document.createElement('span');
                    timeSpan.style.color = '#17a2b8'; // Teal (Inventory color)
                    timeSpan.style.fontSize = '0.85em';
                    timeSpan.style.marginLeft = '8px';
                    timeSpan.textContent = `📅 Added: ${dateStr}`;
                    card.querySelector('.lister-item-meta').appendChild(timeSpan);
                }

                // 3. ACTIVE: Show "Days Listed" Counter (Pressure/Stale Check)
                else if (item.status === 'Active' || item.status === 'Pending' || item.status === 'Sold') {
                    const WARNING_DAYS = 14;
                    const DANGER_DAYS = 30;

                    let badgeText = `🕒 ${days}d`;
                    let badgeColor = '#6c757d'; // Grey (Fresh)

                    if (item.status === 'Sold') {
                        badgeText = `🏁 Sold in ${days}d`;
                        badgeColor = '#28a745';
                    } else if (days > DANGER_DAYS) {
                        badgeColor = '#dc3545'; // Red
                        badgeText = `🔥 ${days}d`;
                    } else if (days > WARNING_DAYS) {
                        badgeColor = '#fd7e14'; // Orange
                    }

                    const timeSpan = document.createElement('span');
                    timeSpan.style.color = badgeColor;
                    timeSpan.style.fontSize = '0.9em';
                    timeSpan.style.marginLeft = '8px';
                    timeSpan.style.fontWeight = '500';
                    timeSpan.textContent = badgeText;
                    card.querySelector('.lister-item-meta').appendChild(timeSpan);
                }
            }

            // Price & Sold Display
            let priceVal = parseFloat(item.price);
            let priceDisplay = "";

            // If price is null (blank), show --
            // If price is 0 (free), show $0.00
            if (item.price === null || isNaN(item.price)) {
                priceDisplay = "$--";
            } else {
                priceDisplay = `$${parseFloat(item.price).toFixed(2)}`;
            }

            // If Sold, show the crossed-out price logic
            if (item.status === 'Sold' && item.soldPrice) {
                const originalPrice = isNaN(priceVal) ? 0 : priceVal;
                priceDisplay = `
                    <span style="text-decoration: line-through; color: #999; margin-right: 5px;">$${originalPrice.toFixed(2)}</span>
                    <span style="color: #28a745; font-weight: bold;">$${parseFloat(item.soldPrice).toFixed(2)}</span>
                `;
            }

            // Insert Price HTML
            card.querySelector('.lister-item-price').innerHTML = priceDisplay;

            // Storage Location (NEW)
            if (item.location) {
                const meta = card.querySelector('.lister-item-meta');
                const locSpan = document.createElement('span');
                locSpan.className = 'storage-location-pill';
                locSpan.textContent = `📦 ${item.location}`;
                meta.appendChild(locSpan);
            }

            // Status
            const sEl = card.querySelector('.lister-item-status');
            sEl.textContent = item.status || 'Draft';
            sEl.className = `lister-item-status status-badge status-${(item.status || 'draft').toLowerCase()}`;

            // Image
            const img = card.querySelector('.lister-item-thumbnail');
            if (item.photos && item.photos.length > 0) img.src = URL.createObjectURL(item.photos[0]);

            // Pills (Links)
            const pills = card.querySelector('.platform-pills');
            const links = listingsMap.get(item.id) || [];
            links.forEach(l => {
                const isFb = l.platform === 'Facebook';
                const isPosh = l.platform === 'Poshmark';
                let pillClass = 'platform-pill' + (isFb ? ' fb' : '') + (isPosh ? ' posh' : '');

                const p = document.createElement('div');
                p.className = pillClass;

                let icon = `🔗`;
                if (isFb) icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`;
                if (isPosh) icon = `<span style="font-weight:bold; font-family:serif; font-size:12px; margin-right:2px;">P</span>`;

                p.innerHTML = `<a href="${l.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${icon} ${l.platform}</a>`;

                const del = document.createElement('button');
                del.className = 'pill-delete-btn';
                del.innerHTML = '×';
                del.onclick = async (e) => { e.stopPropagation(); if (confirm("Unlink?")) { await listerDB.deleteListing(l.id); renderItemList(); } };
                p.appendChild(del);
                pills.appendChild(p);
            });

            // Buttons
            // Buttons
            const postBtn = card.querySelector('.lister-post-btn');

            // LOGIC: If Inventory, show "List 1". If normal, show "Post".
            if (item.status === 'Inventory') {
                postBtn.innerHTML = '📋 List 1';
                postBtn.style.backgroundColor = '#17a2b8'; // Teal Color
                postBtn.title = "Take 1 from Inventory and move to Drafts";
                postBtn.onclick = (e) => {
                    e.stopPropagation();
                    listOneFromInventory(item.id);
                };

                // Show Qty on the card if it's inventory
                if (item.quantity > 1) {
                    const titleEl = card.querySelector('.lister-item-title');
                    if (titleEl) titleEl.innerHTML += ` <span style="font-size:0.8em; color:#17a2b8;">(x${item.quantity})</span>`;
                }

            } else {
                // Standard Selling Behavior
                postBtn.innerHTML = '🚀 Post';
                postBtn.style.backgroundColor = ''; // Reset color
                postBtn.onclick = (e) => {
                    e.stopPropagation();
                    openPostingAssistant(item);
                };
            }
            card.querySelector('.lister-sold-btn').onclick = () => openSoldModal(item);
            card.querySelector('.lister-edit-btn').onclick = () => showFormView(item);

            const editBtn = card.querySelector('.lister-edit-btn');
            // Add Copy Button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'lister-icon-btn';
            copyBtn.innerHTML = '📄';
            copyBtn.title = "Duplicate Item";
            copyBtn.style.marginLeft = "5px"; copyBtn.style.border = "none"; copyBtn.style.background = "none"; copyBtn.style.fontSize = "18px";
            copyBtn.onclick = (e) => { e.stopPropagation(); duplicateItem(item.id); };
            editBtn.parentNode.insertBefore(copyBtn, editBtn.nextSibling);

            // Smart Delete / Unbundle Logic
            card.querySelector('.lister-delete-btn').onclick = async (e) => {
                e.stopPropagation(); // Stop click from opening the folder/card

                // 1. If it is a BUNDLE, ask to Unbundle first
                if (item.isBundle) {
                    // Custom confirm message
                    const choice = confirm(`Unbundle "${item.title}"?\n\nOK = Restore original items (Recommended).\nCancel = Permanently Delete everything.`);

                    if (choice) {
                        await unbundleItem(item.id);
                        return; // Stop here, do not run the delete code below
                    }
                }

                // 2. Standard Delete (For normal items or if user cancelled unbundle)
                if (confirm('Delete this item permanently?')) {
                    await listerDB.deleteItem(item.id);
                    await listerDB.deleteListingsForItem(item.id);
                    await populateCategoryFilter();
                    renderItemList();
                }
            };

            return card;
        };

        // --- GROUP LOGIC (VERTICAL STACK) ---
        if (isGrouped) {
            const groups = ['Draft', 'Active', 'Pending', 'Sold', 'Inventory', 'Archived'];

            // 1. Create Main Container
            const stackContainer = document.createElement('div');
            stackContainer.className = 'lister-dashboard-grid'; // Uses the new CSS class

            for (const status of groups) {
                const groupItems = filteredItems.filter(i => (i.status || 'Draft') === status);

                // Skip empty folders (Change to true if you want to see empty ones)
                if (groupItems.length === 0) continue;

                // 2. Create Wrapper Card
                const folderCard = document.createElement('div');
                folderCard.className = 'lister-folder-card';

                // 3. Create Header
                const header = document.createElement('div');
                header.className = 'lister-folder-header';
                // Add an arrow and the count
                header.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:18px;">📂</span> 
                        <span>${status}</span>
                    </div>
                    <span class="count-badge" style="background:#eee; padding:4px 10px; border-radius:12px;">${groupItems.length}</span>
                 `;

                // 4. Create Item List Container
                const itemContainer = document.createElement('div');
                itemContainer.className = 'lister-folder-items';

                // 5. Click to Toggle (FIXED)
                header.onclick = () => {
                    // Check if it's currently open (flex). If not flex (or empty), it's closed.
                    const isOpen = itemContainer.style.display === 'flex';

                    if (isOpen) {
                        // CLOSE IT
                        itemContainer.style.display = 'none';
                        header.style.background = '#ffffff';
                    } else {
                        // OPEN IT
                        itemContainer.style.display = 'flex';
                        header.style.background = '#f1f3f5';
                    }
                };

                // 6. Add Items
                groupItems.forEach(item => {
                    const c = renderCard(item);
                    itemContainer.appendChild(c);
                });

                // 7. Assemble
                folderCard.appendChild(header);
                folderCard.appendChild(itemContainer);
                stackContainer.appendChild(folderCard);
            }

            containerEl.appendChild(stackContainer);

        } else {
            // Flat List (Standard View)
            filteredItems.forEach(item => {
                containerEl.appendChild(renderCard(item));
            });
        }
    }

    // --- FORM VIEW ---
    function showFormView(item = null) {
        // --- MARK ESSENTIAL FIELDS FOR SOURCING MODE ---
        // We do this dynamically to ensure they stick
        document.getElementById('lister-title').closest('.form-group').classList.add('essential-field');
        document.getElementById('lister-cost').closest('.form-group').classList.add('essential-field');
        document.getElementById('lister-photo-dropzone').closest('.form-group').classList.add('essential-field');

        // Mark the row containing Qty/Cost/Price as essential, but we might hide individual children via CSS if needed
        const costRow = document.getElementById('lister-cost').closest('.form-group-row');
        if (costRow) costRow.classList.add('essential-row');
        document.getElementById('lister-list-view').classList.add('is-hidden');
        document.getElementById('lister-form-view').classList.remove('is-hidden');
        itemForm.reset();
        currentPhotos = [];
        imageHandler.refreshPhotoGallery('lister-photo-preview-gallery');

        if (item) {
            document.getElementById('lister-form-title').textContent = 'Edit Item';
            document.getElementById('lister-item-id').value = item.id;
            document.getElementById('lister-title').value = item.title;
            document.getElementById('lister-description').value = item.description;
            document.getElementById('lister-cost').value = item.cost;
            document.getElementById('lister-quantity').value = item.quantity || 1;
            document.getElementById('lister-price').value = item.price;
            // --- NEW FIELDS ---
            document.getElementById('lister-retail-price').value = item.retailPrice || '';
            document.getElementById('lister-invoice-num').value = item.invoiceNum || '';

            // NEW: SHOW SOLD PRICE FIELD
            const soldGroup = document.getElementById('lister-sold-price-group');
            const soldInput = document.getElementById('lister-sold-price');
            if (item.status === 'Sold') {
                soldGroup.classList.remove('is-hidden');
                soldInput.value = item.soldPrice || '';
            } else {
                soldGroup.classList.add('is-hidden');
                soldInput.value = '';
            }
            // ... continue with rest of function ...
            document.getElementById('lister-notes').value = item.notes;
            document.getElementById('lister-category').value = item.category || '';
            document.getElementById('lister-condition').value = item.condition || 'new';

            // SAFE CHECK: Only fill if the inputs exist in HTML
            const brandEl = document.getElementById('lister-brand');
            if (brandEl) brandEl.value = item.brand || '';

            const sizeEl = document.getElementById('lister-size');
            if (sizeEl) sizeEl.value = item.size || '';

            document.getElementById('lister-tags').value = item.tags || '';
            document.getElementById('lister-location').value = item.location || '';
            document.getElementById('lister-status').value = item.status || 'Draft';

            if (item.photos && Array.isArray(item.photos)) {
                currentPhotos = [...item.photos];
                imageHandler.refreshPhotoGallery('lister-photo-preview-gallery');
            }
        } else {
            document.getElementById('lister-form-title').textContent = 'Add New Item';
            document.getElementById('lister-item-id').value = '';
            // Trigger smart field check
            updateFormFields();
        }
    }
    // --- SECTION 4: UNBUNDLE LOGIC ---
    async function unbundleItem(bundleId) {
        if (!confirm("Are you sure you want to unbundle this item? The original items will be restored.")) return;

        try {
            // 1. Get the parent bundle item
            const bundleItem = await listerDB.getItem(bundleId);
            if (!bundleItem || !bundleItem.isBundle) {
                showToast("This is not a bundle.");
                return;
            }

            // 2. Get all children
            if (bundleItem.childItemIds && bundleItem.childItemIds.length > 0) {
                const allItems = await listerDB.getAllItems();
                const children = allItems.filter(i => bundleItem.childItemIds.includes(i.id));

                // 3. Un-hide children and remove link to parent
                for (const child of children) {
                    child.isHidden = false;
                    delete child.parentBundleId;
                    await listerDB.saveItem(child);
                }
            }

            // 4. Delete the parent bundle item
            await listerDB.deleteItem(bundleId);

            // 5. Refresh UI
            showToast("Unbundled successfully!");
            renderItemList();

        } catch (e) {
            console.error("Unbundling error:", e);
            showToast("Failed to unbundle.");
        }
    }

    // --- MODAL (FIXED FOR DRAG) ---
    function openPostingAssistant(item) {
        // 1. CLEAR THE LINK INPUT
        document.getElementById('lister-listing-url').value = '';

        currentItemForPosting = item;
        document.getElementById('lister-posting-modal').classList.remove('is-hidden');

        // --- PROFIT CALCULATION (SMART DISPLAY) ---
        const cost = item.cost;
        const price = item.price || 0; // Assume 0 if price is unknown for math purposes

        const costEl = document.getElementById('lister-modal-cost');
        const profitEl = document.getElementById('lister-modal-profit');

        if (costEl) {
            // STRICT CHECK: Only show "--" if it is actually null
            if (cost === null) {
                costEl.textContent = "$--";
            } else {
                // If cost is 0, this will print "$0.00" (Correct!)
                costEl.textContent = `$${parseFloat(cost).toFixed(2)}`;
            }
        }

        if (profitEl) {
            if (cost === null) {
                profitEl.textContent = "$--";
                profitEl.style.color = "#666";
            } else {
                // If cost is 0, Profit = Price - 0. (Correct!)
                const profit = price - cost;
                profitEl.textContent = `$${profit.toFixed(2)}`;

                if (profit >= 0) profitEl.style.color = '#28a745';
                else profitEl.style.color = '#dc3545';
            }
        }

        const missing = [];
        if (!item.category) missing.push("Category");
        if (!item.condition) missing.push("Condition");
        if (missing.length > 0) showToast(`Missing: ${missing.join(', ')}`);

        document.getElementById('lister-copy-title').value = item.title;
        document.getElementById('lister-copy-price').value = item.price;
        document.getElementById('lister-copy-description').value = item.description;
        document.getElementById('lister-copy-brand').value = item.brand || '';
        document.getElementById('lister-copy-size').value = item.size || '';
        document.getElementById('lister-copy-tags').value = item.tags || '';
        document.getElementById('lister-copy-category').value = item.category || '';
        document.getElementById('lister-copy-location').value = item.location || '';
        document.getElementById('lister-copy-condition').value = item.condition || 'new';



        // Setup read-only copy of photos in modal with SYNTHETIC FILE logic
        const modalGallery = document.getElementById('lister-modal-photo-gallery');
        modalGallery.innerHTML = '';
        if (item.photos) {
            item.photos.forEach((blob, idx) => {
                const div = document.createElement('div');
                div.className = 'preview-wrapper';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(blob);

                // ==========================================
                // ⛔️ CRITICAL: IMAGE HANDLING LOGIC (SYNTHETIC FILE DRAG)
                // DO NOT TOUCH
                // ==========================================

                // DRAG FIX START
                img.draggable = true;
                img.addEventListener('dragstart', (e) => {
                    // 1. Clear default to prevent navigation/unload error
                    e.dataTransfer.clearData();

                    [cite_start]// 2. Construct synthetic file [cite: 84, 94]
                    const mimeType = blob.type || 'image/jpeg';
                    const extension = mimeType.split('/')[1] || 'jpg';
                    const syntheticFile = new File([blob], `listing_photo_${idx}.${extension}`, {
                        type: mimeType
                    });

                    [cite_start]// 3. Add to items list [cite: 84]
                    if (e.dataTransfer.items) {
                        e.dataTransfer.items.add(syntheticFile);
                    }

                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setDragImage(img, 20, 20);
                });
                // DRAG FIX END

                // ==========================================
                // ⛔️ END PROTECTED ZONE
                // ==========================================

                div.onclick = () => imageHandler.copyBlobToClipboard(blob);

                const overlay = document.createElement('div');
                overlay.className = 'preview-copy-overlay';
                overlay.textContent = "Drag to FB";
                div.appendChild(img);
                div.appendChild(overlay);
                modalGallery.appendChild(div);
            });
        }
    }

    async function handleSaveEdits(showMsg = true) {
        if (!currentItemForPosting) return;
        currentItemForPosting.title = document.getElementById('lister-copy-title').value;
        currentItemForPosting.price = parseFloat(document.getElementById('lister-copy-price').value);
        currentItemForPosting.brand = document.getElementById('lister-copy-brand').value; // NEW
        currentItemForPosting.size = document.getElementById('lister-copy-size').value;   // NEW
        currentItemForPosting.description = document.getElementById('lister-copy-description').value;
        currentItemForPosting.tags = document.getElementById('lister-copy-tags').value;
        currentItemForPosting.category = document.getElementById('lister-copy-category').value;
        currentItemForPosting.location = document.getElementById('lister-copy-location').value;
        currentItemForPosting.condition = document.getElementById('lister-copy-condition').value;
        await listerDB.saveItem(currentItemForPosting);
        await populateCategoryFilter();
        renderItemList();
        if (showMsg) showToast('Changes Saved!');
    }

    async function handleCopyData() {
        await handleSaveEdits(false);
        const data = {
            title: currentItemForPosting.title,
            price: String(Math.round(currentItemForPosting.price)),
            description: currentItemForPosting.description,
            category: currentItemForPosting.category,
            condition: currentItemForPosting.condition,
            tags: currentItemForPosting.tags,
            location: currentItemForPosting.location,
            quantity: currentItemForPosting.quantity || 1,
            brand: currentItemForPosting.brand || '',
            size: currentItemForPosting.size || ''
        };
        await navigator.clipboard.writeText(JSON.stringify(data));
        showToast('Data Copied to Clipboard!');
    }

    async function handleLinkListing() {
        let url = document.getElementById('lister-listing-url').value.trim();
        if (!url) { showToast('Please enter a URL'); return; }
        if (!url.startsWith('http')) url = 'https://' + url;

        // Detect Platform
        let platform = 'Other';
        const lowerUrl = url.toLowerCase();

        if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.me')) {
            platform = 'Facebook';
        } else if (lowerUrl.includes('poshmark')) {
            platform = 'Poshmark';
        }
        await listerDB.saveListing({
            itemId: currentItemForPosting.id,
            platform: platform,
            url: url,
            date: new Date().toISOString()
        });

        if (currentItemForPosting.status === 'Draft') {
            currentItemForPosting.status = 'Active';
            await listerDB.saveItem(currentItemForPosting);
        }

        document.getElementById('lister-posting-modal').classList.add('is-hidden');

        // CLEAR INPUT AFTER SAVING
        document.getElementById('lister-listing-url').value = '';

        renderItemList();
        showToast('Listing Linked!');
    }

    function openSoldModal(item) {
        // 1. Set ID
        document.getElementById('lister-sold-item-id').value = item.id;

        // 2. Set Price (Auto-fill with current price)
        const priceInput = document.getElementById('lister-sold-modal-price');
        priceInput.value = item.price;

        // 3. SET NOTES (This is what you asked for)
        // It pulls existing notes, or leaves it blank if none exist.
        document.getElementById('lister-sold-modal-notes').value = item.notes || '';

        // 4. Show Modal
        document.getElementById('lister-sold-modal').classList.remove('is-hidden');

        // 5. Mobile Convenience: Auto-focus the price field
        setTimeout(() => {
            priceInput.focus();
            priceInput.select();
        }, 100);
    }

    async function handleMarkAsSold() {
        const itemId = parseInt(document.getElementById('lister-sold-item-id').value, 10);
        const soldPrice = parseFloat(document.getElementById('lister-sold-modal-price').value);
        const notes = document.getElementById('lister-sold-modal-notes').value;

        if (!itemId || isNaN(soldPrice)) {
            showToast('Invalid data. Please check the price.');
            return;
        }

        const item = await listerDB.getItem(itemId);
        if (item) {
            item.status = 'Sold';
            item.soldPrice = soldPrice;
            item.dateSold = new Date().toISOString();
            item.notes = notes;
            await listerDB.saveItem(item);

            document.getElementById('lister-sold-modal').classList.add('is-hidden');
            renderItemList();
            showToast('Item marked as Sold!');
        } else {
            showToast('Error: Item not found.');
        }
    }

    // --- SMART FORM LOGIC ---
    const statusSelect = document.getElementById('lister-status');

    function updateFormFields() {
        const status = statusSelect.value;
        const priceGroup = document.getElementById('lister-price').closest('.form-group');
        const soldGroup = document.getElementById('lister-sold-price-group');

        if (status === 'Inventory') {
            // If Inventory: Hide Price, Hide Sold Price
            priceGroup.classList.add('is-hidden');
            soldGroup.classList.add('is-hidden');
        } else if (status === 'Sold') {
            // If Sold: Show Price, Show Sold Price
            priceGroup.classList.remove('is-hidden');
            soldGroup.classList.remove('is-hidden');
        } else {
            // Draft/Active: Show Price, Hide Sold Price
            priceGroup.classList.remove('is-hidden');
            soldGroup.classList.add('is-hidden');
        }
    }

    // --- INIT ---
    async function main() {
        // --- SMART HISTORY LOGIC (Last 5 Only) ---
        const HISTORY_FIELDS = ['title', 'brand', 'size', 'category', 'location', 'tags'];

        function loadFieldHistory() {
            HISTORY_FIELDS.forEach(field => {
                const input = document.getElementById(`lister-${field}`);
                if (!input) return;

                // 1. Create Datalist dynamically (so you don't have to edit HTML)
                let datalist = document.getElementById(`history-${field}`);
                if (!datalist) {
                    datalist = document.createElement('datalist');
                    datalist.id = `history-${field}`;
                    document.body.appendChild(datalist);

                    // Link input to this list & KILL browser autocomplete
                    input.setAttribute('list', `history-${field}`);
                    input.setAttribute('autocomplete', 'off');
                }

                // 2. Populate from Memory
                const history = JSON.parse(localStorage.getItem(`lister_history_${field}`) || '[]');
                datalist.innerHTML = '';
                history.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    datalist.appendChild(opt);
                });
            });
        }

        function saveFieldHistory() {
            HISTORY_FIELDS.forEach(field => {
                const input = document.getElementById(`lister-${field}`);
                if (!input) return;
                const val = input.value.trim();
                if (!val) return;

                // Get current history
                let history = JSON.parse(localStorage.getItem(`lister_history_${field}`) || '[]');

                // Remove duplicate if exists, then add new value to the TOP
                history = history.filter(h => h.toLowerCase() !== val.toLowerCase());
                history.unshift(val);

                // LIMIT TO LAST 5
                if (history.length > 5) history.length = 5;

                // Save back
                localStorage.setItem(`lister_history_${field}`, JSON.stringify(history));
            });
            loadFieldHistory(); // Refresh immediately
        }

        // Load history when app starts
        loadFieldHistory();
        initMassActionUI();
        await listerDB.init();
        // --- MIGRATION: Fix Items Missing UUIDs ---
        const allItems = await listerDB.getAllItems();
        let fixedCount = 0;
        for (const item of allItems) {
            if (!item.uuid) {
                item.uuid = generateUUID(); // Assign new timestamped UUID
                await listerDB.saveItem(item);
                fixedCount++;
            }
        }
        if (fixedCount > 0) console.log(`System: Fixed ${fixedCount} items missing UUIDs.`);
        // ------------------------------------------
        await populateCategoryFilter();
        // --- VERSION & BACKUP TRACKING ---
        const APP_VERSION = "1.0.1"; // CHANGE THIS NUMBER whenever you update code!
        document.getElementById('lister-app-version').textContent = `v${APP_VERSION}`;

        function updateLastBackupUI() {
            const lastDate = localStorage.getItem('lister_last_backup_time');
            const el = document.getElementById('lister-last-backup');
            if (lastDate) {
                const dateObj = new Date(lastDate);
                // Format: "Dec 22, 4:30 PM"
                const niceTime = dateObj.toLocaleDateString() + ", " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                el.textContent = `Last Backup: ${niceTime}`;

                // Visual Alert: If older than 24 hours, turn slightly orange
                const hoursOld = (new Date() - dateObj) / (1000 * 60 * 60);
                if (hoursOld > 24) el.style.color = "#fd7e14";
                else el.style.color = "#adb5bd"; // Reset to grey
            } else {
                el.textContent = "Last Backup: Never (⚠ Not Saved)";
                el.style.color = "#dc3545"; // Red alert
            }
        }

        // Call immediately on load
        updateLastBackupUI();

        // Helper to save current time
        function markBackupComplete() {
            localStorage.setItem('lister_last_backup_time', new Date().toISOString());
            updateLastBackupUI();
        }
        // --- SOURCING MODE TOGGLE ---
        const sourcingToggle = document.getElementById('lister-sourcing-toggle');
        if (sourcingToggle) {
            sourcingToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    document.body.classList.add('sourcing-active');
                    // Change Save Button Text
                    document.querySelector('#lister-item-form button[type="submit"]').textContent = "⚡ Save & Next";
                    // CHANGE THIS TO 'Draft'
                    document.getElementById('lister-status').value = 'Draft';
                    showToast("Sourcing Mode ON");
                } else {
                    document.body.classList.remove('sourcing-active');
                    // Revert Save Button Text
                    document.querySelector('#lister-item-form button[type="submit"]').textContent = "Save Item";
                    showToast("Sourcing Mode OFF");
                }
            });
        }

        // Run this whenever Status changes
        if (statusSelect) {
            statusSelect.addEventListener('change', updateFormFields);
        }
        // --- LISTENERS FOR NEW FEATURES (MOVED HERE) ---
        // 1. Group Toggle
        const groupToggle = document.getElementById('lister-group-toggle');
        if (groupToggle) {
            groupToggle.addEventListener('change', renderItemList);
        }
        // 2. AI Prompt Button
        const aiBtn = document.getElementById('lister-ai-btn');
        if (aiBtn) {
            aiBtn.onclick = () => {
                const title = document.getElementById('lister-title').value;
                const desc = document.getElementById('lister-description').value;
                const cond = document.getElementById('lister-condition').value;
                const brand = document.getElementById('lister-brand').value;

                const prompt = `Write a Facebook Marketplace listing for: "${title}".
Brand: ${brand}
Condition: ${cond}
Details: ${desc}
Make it catchy, use bullet points for features, and include a "Pickup in [Your City]" line.`;

                navigator.clipboard.writeText(prompt).then(() => {
                    showToast("🤖 AI Prompt Copied!");
                });
            };
        }
        renderItemList();

        // --- 3. NEW: "Select All" Header Button Logic ---
        // If you have a button in your HTML with id="lister-select-all-btn", this makes it work.
        // If not, you can ignore this, or add <button id="lister-select-all-btn">Select All</button> to your HTML.
        const selectAllBtn = document.getElementById('lister-select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.textContent = 'Select All';
            selectAllBtn.onclick = () => {
                // Always select all visible items.
                toggleSelectAll(true);
            };
        }
        // 1. Bind Auto-Save
        const asBtn = document.getElementById('lister-autosave-btn');
        if (asBtn) asBtn.onclick = enableAutoSave;

        // 2. Bind Split Export
        const splitBtn = document.getElementById('lister-export-split-btn');
        if (splitBtn) splitBtn.onclick = exportDataSplit;

        // 3. Ensure Import uses the new handleImport
        document.getElementById('lister-import-file-input').onchange = handleImport;

        // 4. Hook Auto-Save into Database Actions (Crucial Step!)
        const originalSaveItem = listerDB.saveItem;
        listerDB.saveItem = async function (item) {
            const result = await originalSaveItem.call(listerDB, item);
            performAutoSave();
            return result;
        };

        const originalDeleteItem = listerDB.deleteItem;
        listerDB.deleteItem = async function (id) {
            const result = await originalDeleteItem.call(listerDB, id);
            performAutoSave();
            return result;
        };
        document.getElementById('lister-add-new-btn').onclick = () => showFormView();
        document.getElementById('lister-cancel-btn').onclick = async () => {
            // 1. Swap Views (Go back to list)
            document.getElementById('lister-list-view').classList.remove('is-hidden');
            document.getElementById('lister-form-view').classList.add('is-hidden');

            // 2. FORCE DISABLE SOURCING MODE
            document.body.classList.remove('sourcing-active'); // Remove the CSS overrides

            const toggle = document.getElementById('lister-sourcing-toggle');
            if (toggle) toggle.checked = false; // Physically uncheck the switch

            // Reset the "Save" button text
            const saveBtn = document.querySelector('#lister-item-form button[type="submit"]');
            if (saveBtn) saveBtn.textContent = "Save Item";

            // 3. REFRESH THE LIST (The Fix!)
            await populateCategoryFilter(); // Update categories in case you added a new one
            await renderItemList();         // Show the new items you just added
        };
        document.getElementById('lister-modal-close-btn').onclick = () => document.getElementById('lister-posting-modal').classList.add('is-hidden');
        document.getElementById('lister-sold-modal-close-btn').onclick = () => document.getElementById('lister-sold-modal').classList.add('is-hidden');
        document.getElementById('lister-sold-modal-save-btn').onclick = handleMarkAsSold;
        // Stats Button Listeners
        const statsBtn = document.getElementById('lister-stats-btn');
        if (statsBtn) statsBtn.onclick = openStatsModal;

        const statsClose = document.getElementById('lister-stats-close-btn');
        if (statsClose) statsClose.onclick = () => document.getElementById('lister-stats-modal').classList.add('is-hidden');

        document.getElementById('lister-csv-btn').onclick = exportToCSV;
        document.getElementById('lister-import-btn').onclick = () => document.getElementById('lister-import-file-input').click();
        document.getElementById('lister-import-file-input').onchange = handleImport;

        document.getElementById('lister-delete-all-btn').onclick = async () => {
            if (confirm("WARNING: This will delete ALL items forever. Are you sure?")) {
                await listerDB.clearDatabase();
                renderItemList();
                populateCategoryFilter();
                showToast("Database Cleared");
            }
        };

        document.getElementById('lister-copy-data-btn').onclick = handleCopyData;
        document.getElementById('lister-save-edits-btn').onclick = () => handleSaveEdits(true);
        // --- ADD THIS NEW BLOCK HERE ---
        const marketBtn = document.getElementById('lister-marketplace-btn');
        const marketMenu = document.getElementById('lister-marketplace-menu');

        // Toggle Menu
        marketBtn.onclick = (e) => {
            e.stopPropagation();
            marketMenu.classList.toggle('is-hidden');
        };

        // Close when clicking an option
        marketMenu.querySelectorAll('a').forEach(link => {
            link.onclick = () => marketMenu.classList.add('is-hidden');
        });

        // Close when clicking anywhere else
        window.addEventListener('click', (e) => {
            if (!marketBtn.contains(e.target) && !marketMenu.contains(e.target)) {
                marketMenu.classList.add('is-hidden');
            }
        });
        document.getElementById('lister-mark-listed-btn').onclick = handleLinkListing;

        // --- FIX: Correct ID is 'lister-search', not 'lister-search-input' ---
        const searchInput = document.getElementById('lister-search');
        if (searchInput) searchInput.oninput = renderItemList; // This fixes the auto-refresh

        document.getElementById('lister-filter-status').onchange = renderItemList;
        document.getElementById('lister-filter-category').onchange = renderItemList;

        // Ensure Group Toggle triggers refresh immediately
        const groupToggleMain = document.getElementById('lister-group-toggle');
        if (groupToggleMain) groupToggleMain.onchange = renderItemList;

        itemForm.onsubmit = async (e) => {
            e.preventDefault();
            saveFieldHistory(); // <--- ADD THIS
            const idVal = document.getElementById('lister-item-id').value;
            const id = idVal ? parseInt(idVal) : null;

            let cat = document.getElementById('lister-category').value.trim();
            if (cat) cat = cat.charAt(0).toUpperCase() + cat.slice(1);

            // Fetch existing to preserve UUID
            let existingItem = null;
            if (id) existingItem = await listerDB.getItem(id);

            const brandInput = document.getElementById('lister-brand');
            const sizeInput = document.getElementById('lister-size');

            // NEW WAY (Saves as null if empty, so we know it's "Unknown"):

            // Get raw values from the inputs
            const costInput = document.getElementById('lister-cost').value;
            const priceInput = document.getElementById('lister-price').value;
            const retailInput = document.getElementById('lister-retail-price').value; // New
            const invoiceInput = document.getElementById('lister-invoice-num').value; // New
            const soldInput = document.getElementById('lister-sold-price').value;

            const item = {
                // Use existing UUID or make a new one
                uuid: (existingItem && existingItem.uuid) ? existingItem.uuid : generateUUID(),
                // --- DATE LOGIC ---
                dateCreated: (existingItem && existingItem.dateCreated) ? existingItem.dateCreated : new Date().toISOString(),
                dateSold: (existingItem && existingItem.dateSold) ? existingItem.dateSold : null,
                // ------------------

                title: document.getElementById('lister-title').value,
                quantity: parseInt(document.getElementById('lister-quantity').value) || 1, // NEW
                // If empty, save as 0 (or null). If valid, save as number.
                cost: costInput === "" ? null : parseFloat(costInput),
                price: priceInput === "" ? null : parseFloat(priceInput),
                soldPrice: soldInput === "" ? null : parseFloat(soldInput),
                retailPrice: retailInput === "" ? null : parseFloat(retailInput), // New
                invoiceNum: invoiceInput, // New
                description: document.getElementById('lister-description').value,
                brand: brandInput ? brandInput.value : '',
                size: sizeInput ? sizeInput.value : '',
                category: cat,
                condition: document.getElementById('lister-condition').value,
                tags: document.getElementById('lister-tags').value,
                location: document.getElementById('lister-location').value,
                notes: document.getElementById('lister-notes').value,
                status: document.getElementById('lister-status').value,
                photos: []
            };
            if (id) item.id = id;
            // ==========================================
            // ⛔️ CRITICAL: IMAGE RESIZING
            // DO NOT TOUCH
            // ==========================================
            const resizePromises = [];
            for (const file of currentPhotos) { resizePromises.push(imageHandler.resizeImage(file)); }
            const processedPhotos = await Promise.all(resizePromises);
            item.photos = processedPhotos.filter(p => p !== null);
            // ==========================================
            // ⛔️ END PROTECTED ZONE
            // ==========================================
            await listerDB.saveItem(item);
            // --- SOURCING MODE: STAY OPEN ---
            if (document.body.classList.contains('sourcing-active')) {
                // 1. Reset Form for next item
                itemForm.reset();
                currentPhotos = [];
                imageHandler.refreshPhotoGallery('lister-photo-preview-gallery');
                document.getElementById('lister-item-id').value = ''; // Ensure we are creating NEW, not overwriting

                // 2. Keep the "Inventory" status selected (usually what you want when sourcing)
                document.getElementById('lister-status').value = 'Draft';

                showToast('Saved! Ready for next.');
            } else {
                // NORMAL MODE: Close and go to list
                document.getElementById('lister-cancel-btn').click();
                await populateCategoryFilter(); // Only needed if we go back to list
                renderItemList();             // Only needed if we go back to list
            }

            showToast('Item Saved!');
        };
        // ==========================================
        // ⛔️ CRITICAL: IMAGE HANDLING LOGIC
        // DO NOT MODIFY, REFACTOR, OR DELETE ANYTHING BETWEEN THESE LINES
        // ==========================================

        // DRAG & DROP HANDLERS (Local)
        const dropzone = document.getElementById('lister-photo-dropzone');
        // dropzone.onclick = () => document.getElementById('lister-photo-input').click();

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = '#6f42c1';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '#ccc';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = '#ccc';
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                imageHandler.processFiles(e.dataTransfer.files);
            }
        });

        document.getElementById('lister-photo-input').onchange = (e) => imageHandler.processFiles(e.target.files);
        // ==========================================
        // ⛔️ END OF PROTECTED ZONE
        // ==========================================
        document.querySelectorAll('.lister-copy-btn').forEach(btn => {
            btn.onclick = () => {
                navigator.clipboard.writeText(document.getElementById(btn.dataset.copyTarget).value);
                showToast('Text Copied');
            };
        });
    }
    async function duplicateItem(id) {
        try {
            const item = await listerDB.getItem(id);
            if (!item) return;

            // 1. Create a shallow copy
            const newItem = { ...item };
            delete newItem.id; // Remove the database ID so a new one is created

            // 2. CRITICAL: Generate a brand new UUID
            // This guarantees the system knows it's a unique item
            newItem.uuid = generateUUID();

            // 3. Smart Title Logic (Detects "Copy" and increments number)
            const title = newItem.title;
            const copyRegex = / \(Copy(?: (\d+))?\)$/;
            const match = title.match(copyRegex);

            if (match) {
                // If it already says "(Copy)" or "(Copy 2)"
                const num = match[1] ? parseInt(match[1], 10) : 1;
                newItem.title = title.replace(copyRegex, ` (Copy ${num + 1})`);
            } else {
                // First time copying
                newItem.title = `${title} (Copy)`;
            }

            newItem.status = 'Draft';

            // 4. Photo Safety (Prevent shared references)
            if (newItem.photos) {
                newItem.photos = [...newItem.photos];
            }

            await listerDB.saveItem(newItem);
            showToast("Item Duplicated!");

            await populateCategoryFilter();
            renderItemList();
        } catch (e) {
            console.error(e);
            showToast("Duplication Failed");
        }
    }

    // --- NEW FEATURE: SELECTION STATE ---
    // We keep track of selected IDs in a simple Set
    const selectedItemIds = new Set();

    function toggleSelection(id, isSelected) {
        if (isSelected) selectedItemIds.add(id);
        else selectedItemIds.delete(id);
        updateMassActionToolbar(); // We will build this in Section 2
    }

    function toggleSelectAll(checked) {
        // We only select what's VISIBLE now.
        const visibleItemCards = document.querySelectorAll('#lister-item-list .lister-item-checkbox');
        visibleItemCards.forEach(cb => {
            const id = parseInt(cb.dataset.id, 10);
            if (checked) {
                selectedItemIds.add(id);
                cb.checked = true;
            } else {
                selectedItemIds.delete(id);
                cb.checked = false;
            }
        });
        updateMassActionToolbar();
    }

    // --- SECTION 2: MASS ACTION UI (UPDATED WITH DROPDOWN) ---

    // --- SECTION 2: MASS ACTION UI (UPDATED WITH BUNDLE BUTTON) ---

    // 1. Inject Floating Toolbar & Picker Modal
    function initMassActionUI() {
        if (document.getElementById('lister-mass-actions')) return;

        // A. Inject CSS
        const style = document.createElement('style');
        style.innerHTML = `
            /* Toolbar Styles */
            #lister-mass-actions {
                position: fixed; bottom: 30px; left: 50%; transform: translate(-50%, 100%);
                background: #212529; color: white; padding: 12px 24px; border-radius: 50px;
                display: flex; align-items: center; gap: 15px; z-index: 9999;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                opacity: 0; pointer-events: none;
            }
            #lister-mass-actions.is-visible { opacity: 1; pointer-events: all; transform: translate(-50%, 0); }
            .mass-divider { width: 1px; height: 20px; background: #555; }
            .mass-btn { background: transparent; border: 1px solid #555; color: white; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; }
            .mass-btn:hover { background: #444; }
            .mass-btn.danger { border-color: #d9534f; color: #d9534f; }
            .mass-btn.danger:hover { background: #d9534f; color: white; }
            
            /* Bundle Button Style */
            .mass-btn.bundle { border-color: #ffc107; color: #ffc107; }
            .mass-btn.bundle:hover { background: #ffc107; color: #000; }

            #lister-selection-count { font-weight: bold; color: #4db8ff; }

            /* Picker Modal Styles */
            #lister-picker-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 10000;
                display: flex; justify-content: center; align-items: center;
                opacity: 0; pointer-events: none; transition: opacity 0.2s;
            }
            #lister-picker-overlay.is-visible { opacity: 1; pointer-events: all; }
            .lister-picker-box {
                background: #2b3035; padding: 25px; border-radius: 12px;
                width: 300px; text-align: center; color: white;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                border: 1px solid #444;
            }
            .lister-picker-select {
                width: 100%; padding: 12px; margin: 20px 0;
                background: #1a1d20; color: white; border: 1px solid #444;
                border-radius: 6px; font-size: 1rem;
            }
            .picker-actions { display: flex; justify-content: flex-end; gap: 10px; }
        `;
        document.head.appendChild(style);

        // B. Inject HTML (Toolbar + Hidden Modal)
        const container = document.createElement('div');
        container.innerHTML = `
            <div id="lister-mass-actions">
                <span><span id="lister-selection-count">0</span> Selected</span>
                <div class="mass-divider"></div>
                <button class="mass-btn bundle" id="mass-bundle-btn">Create Bundle</button>
                <div class="mass-divider"></div>
                <button class="mass-btn" id="mass-status-btn">Set Status</button>
                <button class="mass-btn" id="mass-category-btn">Set Category</button>
                <div class="mass-divider"></div>
                <button class="mass-btn danger" id="mass-delete-btn">Delete</button>
                <button class="mass-btn" id="mass-cancel-btn">✕</button>
            </div>

            <div id="lister-picker-overlay">
                <div class="lister-picker-box">
                    <h3 id="lister-picker-title">Select Status</h3>
                    <select id="lister-picker-select" class="lister-picker-select"></select>
                    <div class="picker-actions">
                        <button class="mass-btn" id="picker-cancel-btn">Cancel</button>
                        <button class="mass-btn" id="picker-confirm-btn" style="background:#0d6efd; border-color:#0d6efd;">Save</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // C. Bind Toolbar Buttons
        document.getElementById('mass-cancel-btn').onclick = () => toggleSelectAll(false);
        document.getElementById('mass-status-btn').onclick = async () => runMassUpdate('status');
        document.getElementById('mass-category-btn').onclick = async () => runMassUpdate('category');
        document.getElementById('mass-delete-btn').onclick = runMassDelete;
        // NEW: Bind Bundle Button
        document.getElementById('mass-bundle-btn').onclick = createBundle;
    }

    // 2. Logic to Update Toolbar Visibility
    function updateMassActionToolbar() {
        const bar = document.getElementById('lister-mass-actions');
        const countSpan = document.getElementById('lister-selection-count');
        const count = selectedItemIds.size;

        if (!bar) return;

        countSpan.textContent = count;
        if (count > 0) {
            bar.classList.add('is-visible');
        } else {
            bar.classList.remove('is-visible');
        }
    }

    // 3. Helper: Show the Custom Dropdown Modal
    function promptSelection(title, options) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('lister-picker-overlay');
            const select = document.getElementById('lister-picker-select');
            const titleEl = document.getElementById('lister-picker-title');
            const confirmBtn = document.getElementById('picker-confirm-btn');
            const cancelBtn = document.getElementById('picker-cancel-btn');

            // Setup UI
            titleEl.textContent = title;
            select.innerHTML = '';
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt; o.textContent = opt;
                select.appendChild(o);
            });

            overlay.classList.add('is-visible');

            // Handlers
            const close = () => {
                overlay.classList.remove('is-visible');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
            };

            confirmBtn.onclick = () => {
                resolve(select.value);
                close();
            };

            cancelBtn.onclick = () => {
                resolve(null);
                close();
            };
        });
    }

    // 4. Logic for Mass Updates
    async function runMassUpdate(field) {
        const count = selectedItemIds.size;
        if (count === 0) return;

        let value = '';

        // --- DIFFERENT LOGIC FOR STATUS VS CATEGORY ---
        if (field === 'status') {
            // Use our new Dropdown
            value = await promptSelection(`Set Status for ${count} Items`, ['Draft', 'Active', 'Sold', 'Pending', 'Archived']);
        } else if (field === 'category') {
            // Keep text prompt for category (or we can upgrade this later)
            value = prompt(`Set CATEGORY for ${count} items:`);
            if (value) value = value.charAt(0).toUpperCase() + value.slice(1);
        }

        if (!value) return; // User cancelled

        // Perform Update
        const items = await listerDB.getAllItems();
        let updatedCount = 0;

        for (const item of items) {
            if (selectedItemIds.has(item.id)) {
                item[field] = value;
                await listerDB.saveItem(item);
                updatedCount++;
            }
        }

        showToast(`Updated ${updatedCount} items!`);
        toggleSelectAll(false); // Clear selection
        await populateCategoryFilter();
        renderItemList();
    }

    async function runMassDelete() {
        const count = selectedItemIds.size;
        if (count === 0) return;

        if (!confirm(`WARNING: Are you sure you want to DELETE ${count} items? This cannot be undone.`)) return;

        for (const id of selectedItemIds) {
            await listerDB.deleteItem(id);
            await listerDB.deleteListingsForItem(id);
        }

        showToast(`Deleted ${count} items.`);
        toggleSelectAll(false); // Clear selection
        await populateCategoryFilter();
        renderItemList();
    }
    // --- SECTION 3: BUNDLING LOGIC ---
    async function createBundle() {
        const count = selectedItemIds.size;
        if (count < 2) {
            showToast("Select at least 2 items to bundle.");
            return;
        }

        if (!confirm(`Create a bundle from these ${count} items? The original items will be hidden.`)) return;

        try {
            // 1. Fetch all selected items
            const allItems = await listerDB.getAllItems();
            const bundleChildren = allItems.filter(i => selectedItemIds.has(i.id));

            // 2. Calculate Totals & Merge Data
            let totalPrice = 0;
            let totalCost = 0;
            let mergedPhotos = [];
            let descriptionList = "Bundle Includes:\n";
            let tagsList = new Set();
            const childIds = [];

            bundleChildren.forEach(child => {
                totalPrice += (parseFloat(child.price) || 0);
                totalCost += (parseFloat(child.cost) || 0);

                // Merge Photos (Keep strict order: Item 1 photos, then Item 2, etc.)
                if (child.photos && Array.isArray(child.photos)) {
                    mergedPhotos = [...mergedPhotos, ...child.photos];
                }

                descriptionList += `- ${child.title}\n`;
                childIds.push(child.id);

                // Merge tags
                if (child.tags) {
                    child.tags.split(',').forEach(t => tagsList.add(t.trim()));
                }
            });

            // 3. Create Parent Bundle Object
            const bundleTitle = `Bundle: ${bundleChildren[0].title} + ${count - 1} more`;

            const bundleItem = {
                title: bundleTitle,
                price: totalPrice,
                cost: totalCost,
                description: descriptionList + "\n" + (bundleChildren[0].description || ""),
                category: bundleChildren[0].category, // Inherit category from first item
                condition: bundleChildren[0].condition,
                location: bundleChildren[0].location,
                tags: Array.from(tagsList).join(', '),
                status: 'Draft',
                photos: mergedPhotos, // The blobs are passed by reference
                isBundle: true,       // NEW FIELD
                childItemIds: childIds // NEW FIELD
            };

            // 4. Save Parent (and get its ID)
            const parentId = await listerDB.saveItem(bundleItem);

            // 5. Hide Children & Link to Parent
            for (const child of bundleChildren) {
                child.isHidden = true;          // NEW FIELD
                child.parentBundleId = parentId; // NEW FIELD
                await listerDB.saveItem(child);
            }

            // 6. Cleanup
            showToast("Bundle Created Successfully!");
            toggleSelectAll(false);
            await populateCategoryFilter();
            renderItemList();

        } catch (e) {
            console.error("Bundling error:", e);
            showToast("Failed to create bundle.");
        }
    }
    async function exportDataSplit() {
        const btn = document.getElementById('lister-export-split-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Processing...';
        btn.disabled = true;

        try {
            // 1. Fetch Items AND Listings
            const [items, allListings] = await Promise.all([
                listerDB.getAllItems(),
                listerDB.getAllListings()
            ]);

            if (items.length === 0) { showToast("No items."); return; }

            const CHUNK_SIZE = 8;
            let chunkIndex = 1;
            const totalChunks = Math.ceil(items.length / CHUNK_SIZE);

            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                btn.textContent = `Saving Part ${chunkIndex}/${totalChunks}...`;
                const chunkItems = items.slice(i, i + CHUNK_SIZE);
                const exportableChunk = [];

                for (const item of chunkItems) {
                    // --- ROBUST EXPORT LOGIC ---
                    // We define the export object first so we don't lose the item if photos fail
                    const exportItem = { ...item, photos: [], listings_backup: [] };

                    try {
                        // A. Safer Photo Processing
                        if (Array.isArray(item.photos)) {
                            for (const p of item.photos) {
                                try {
                                    const b64 = await imageHandler.blobToBase64(p);
                                    if (b64) exportItem.photos.push(b64);
                                } catch (photoErr) {
                                    console.warn(`Skipping bad photo in item "${item.title}"`, photoErr);
                                }
                            }
                        }

                        // B. Link Processing
                        const myLinks = allListings.filter(l => l.itemId === item.id);
                        exportItem.listings_backup = myLinks;

                        // C. Add to chunk
                        exportableChunk.push(exportItem);

                    } catch (itemErr) {
                        // This catch should rarely trigger now, but just in case:
                        console.error(`Critical error exporting item: ${item.title}`, itemErr);
                        // Even if it fails, try to push the raw item without photos
                        exportableChunk.push({ ...item, photos: [], notes: (item.notes || '') + " [Export Error: Photos Lost]" });
                    }
                }

                const json = JSON.stringify({ version: 5, part: chunkIndex, items: exportableChunk }, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `lister-backup-PART${chunkIndex}-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);

                chunkIndex++;
                await new Promise(r => setTimeout(r, 500));
            }
            showToast("Split Export Complete!");
            markBackupComplete();
        } catch (e) { console.error(e); showToast("Split Failed"); }
        finally { btn.textContent = originalText; btn.disabled = false; }
    }
    let autoSaveHandle = null;
    let isAutoSaving = false;

    async function enableAutoSave() {
        if (!('showSaveFilePicker' in window)) return alert("Browser not supported (Use Chrome/Edge)");
        try {
            autoSaveHandle = await window.showSaveFilePicker({
                suggestedName: `lister_LIVE_BACKUP.json`,
                types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
            });
            const btn = document.getElementById('lister-autosave-btn');
            btn.textContent = "🟢 Auto-Save ON";
            btn.style.backgroundColor = "#e6fffa";
            await performAutoSave();
            showToast("Auto-Save Active!");
        } catch (err) { console.log("Auto-save cancelled"); }
    }

    async function performAutoSave() {
        if (!autoSaveHandle || isAutoSaving) return;
        isAutoSaving = true;
        try {
            const items = await listerDB.getAllItems();
            const exportableItems = items.map(item => {
                const { photos, ...rest } = item;
                return { ...rest, photos: [] }; // No photos to keep it fast
            });
            const json = JSON.stringify({ version: 4, type: 'autosave', timestamp: new Date().toISOString(), items: exportableItems }, null, 2);
            const writable = await autoSaveHandle.createWritable();
            await writable.write(json);
            await writable.close();
            markBackupComplete();
            console.log("Auto-saved @ " + new Date().toLocaleTimeString());
        } catch (err) {
            console.error("Auto-save error:", err);
            const btn = document.getElementById('lister-autosave-btn');
            btn.textContent = "🔴 Enable Auto-Save";
            btn.style.backgroundColor = "";
            autoSaveHandle = null;
        } finally { isAutoSaving = false; }
    }

    // 1. Run the App Logic
    main();
}