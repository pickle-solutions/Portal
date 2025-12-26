// Define state variables outside the function so they don't get trapped in closures
// This ensures we can reset them without re-attaching event listeners
let vaultState = {
    decryptedVault: [],
    currentMasterKey: null,
    hasUnsavedChanges: false,
    autoLockTimer: null,
    initialized: false // Flag to track if we've already set up the app
};

function initVaultModule() {
    // 1. Grab DOM Elements
    const loginView = document.getElementById("login-view");
    const vaultView = document.getElementById("vault-view");
    const masterPasswordInput = document.getElementById("master-password");
    const vaultFileInput = document.getElementById("vault-file-input");
    const unlockBtn = document.getElementById("unlock-btn");
    const loginError = document.getElementById("login-error");

    const saveAndLockBtn = document.getElementById("save-and-lock-btn");
    const addAccountForm = document.getElementById("add-account-form");
    const generatePassBtn = document.getElementById("generate-pass-btn");
    const accountListDiv = document.getElementById("account-list");

    const addEmailBtn = document.getElementById("add-email-btn");
    const emailInputsContainer = document.getElementById("email-inputs-container");
    const exportCsvBtn = document.getElementById("export-csv-btn");

    const searchBar = document.getElementById("search-bar");
    const editModalBackdrop = document.getElementById("edit-modal-backdrop");
    const editAccountForm = document.getElementById("edit-account-form");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const editGeneratePassBtn = document.getElementById("edit-generate-pass-btn");
    const editAddEmailBtn = document.getElementById("edit-add-email-btn");

    // --- RESET STATE ON LOAD ---
    // Every time this module opens, we ensure the UI is reset
    resetVaultUI();

    // --- PREVENTION CHECK ---
    // If listeners are already attached, stop here to prevents the "Double Input" bug.
    if (vaultState.initialized) {
        return;
    }
    vaultState.initialized = true; // Mark as done

    // --- EVENT LISTENERS (Only attached once now) ---

    unlockBtn.addEventListener("click", async () => {
        const password = masterPasswordInput.value;
        const file = vaultFileInput.files[0];

        if (!password) {
            showError("Master Password is required.");
            return;
        }

        try {
            if (file) {
                const fileContent = await file.text();
                const vault = JSON.parse(fileContent);
                const key = await getKey(password, base64ToArrayBuffer(vault.salt));
                const decrypted = await decrypt(key, base64ToArrayBuffer(vault.iv), base64ToArrayBuffer(vault.ciphertext));
                vaultState.decryptedVault = JSON.parse(decrypted);
                vaultState.decryptedVault = migrateVaultData(vaultState.decryptedVault);
                vaultState.currentMasterKey = key;
            } else {
                const salt = crypto.getRandomValues(new Uint8Array(16));
                vaultState.currentMasterKey = await getKey(password, salt);
                vaultState.decryptedVault = [];
            }

            showVaultView();
            renderAccounts();
            startAutoLockTimer();

        } catch (err) {
            console.error("Unlock failed:", err);
            showError("Unlock Failed. Check password or file.");
        }
    });

    // 2. Fixed Password Toggle: attached to document.body instead of missing 'app-content'
    document.body.addEventListener("click", (e) => {
        // Handle Password Toggles
        if (e.target.classList.contains("toggle-form-pass")) {
            const button = e.target;
            const targetInput = document.getElementById(button.dataset.target);
            if (!targetInput) return;

            if (targetInput.type === "password") {
                targetInput.type = "text";
                button.textContent = "🙈";
            } else {
                targetInput.type = "password";
                button.textContent = "👁️";
            }
        }
    });

    // Handle clicks inside the Account List (Expand, Copy, Edit, Delete, Show Pass)
    accountListDiv.addEventListener("click", (e) => {
        const target = e.target;

        const header = target.closest('.account-header');
        const button = target.closest('button');
        const toggle = target.closest('.password-toggle');

        // Handle Expand/Collapse
        if (header && !button && !toggle) {
            const item = header.closest('.account-item');
            item.classList.toggle('is-open');
            return;
        }

        // Handle "Show" in the list
        if (toggle) {
            const passSpan = toggle.previousElementSibling;
            const password = passSpan.dataset.password;

            if (toggle.dataset.state === "hidden") {
                passSpan.textContent = password;
                toggle.textContent = "🙈 Hide";
                toggle.dataset.state = "visible";

                // Auto-hide after 5 seconds
                setTimeout(() => {
                    if (passSpan && toggle) { // Check if elements still exist
                        passSpan.textContent = "********";
                        toggle.textContent = "👁️ Show";
                        toggle.dataset.state = "hidden";
                    }
                }, 5000);
            } else {
                passSpan.textContent = "********";
                toggle.textContent = "👁️ Show";
                toggle.dataset.state = "hidden";
            }
            return;
        }

        if (button) {
            const index = button.dataset.index;
            if (index === undefined) return;

            if (button.classList.contains("copy-pass-btn")) {
                const password = vaultState.decryptedVault[index].password;
                navigator.clipboard.writeText(password).then(() => {
                    const originalText = button.textContent;
                    button.textContent = "Copied!";
                    setTimeout(() => { button.textContent = originalText; }, 2000);
                });
            }

            if (button.classList.contains("delete-btn")) {
                if (confirm(`Delete account for ${vaultState.decryptedVault[index].website}?`)) {
                    vaultState.decryptedVault.splice(index, 1);
                    renderAccounts(searchBar.value);
                    vaultState.hasUnsavedChanges = true;
                }
            }

            if (button.classList.contains("edit-btn")) {
                openEditModal(index);
            }
        }
    });

    addEmailBtn.addEventListener("click", () => {
        addEmailInput(emailInputsContainer);
    });

    addAccountForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const emailInputs = emailInputsContainer.querySelectorAll(".acc-email");
        const emails = [];
        emailInputs.forEach(input => {
            if (input.value) { emails.push(input.value); }
        });

        const newAccount = {
            website: document.getElementById("acc-website").value,
            username: document.getElementById("acc-username").value,
            emails: emails,
            password: document.getElementById("acc-password").value,
            note: document.getElementById("acc-note").value,
        };

        vaultState.decryptedVault.push(newAccount);
        renderAccounts(searchBar.value);
        vaultState.hasUnsavedChanges = true;

        addAccountForm.reset();
        // Reset email container to single input
        emailInputsContainer.innerHTML = `
            <div class="email-input-group">
                <input type="email" class="acc-email" placeholder="Account Email" required>
                <button type="button" class="remove-email-btn" style="display: none;">Remove</button>
            </div>
        `;
    });

    generatePassBtn.addEventListener("click", () => {
        document.getElementById("acc-password").value = generatePassword();
    });

    editGeneratePassBtn.addEventListener("click", () => {
        document.getElementById("edit-acc-password").value = generatePassword();
    });

    editAddEmailBtn.addEventListener("click", () => {
        addEmailInput(document.getElementById("edit-email-inputs-container"));
    });

    cancelEditBtn.addEventListener("click", closeEditModal);

    editAccountForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const index = document.getElementById("edit-acc-index").value;
        if (index === "") return;

        const editEmailContainer = document.getElementById("edit-email-inputs-container");
        const emailInputs = editEmailContainer.querySelectorAll(".acc-email");
        const emails = [];
        emailInputs.forEach(input => {
            if (input.value) { emails.push(input.value); }
        });

        const updatedAccount = {
            website: document.getElementById("edit-acc-website").value,
            username: document.getElementById("edit-acc-username").value,
            emails: emails,
            password: document.getElementById("edit-acc-password").value,
            note: document.getElementById("edit-acc-note").value,
        };

        vaultState.decryptedVault[index] = updatedAccount;

        renderAccounts(searchBar.value);
        closeEditModal();
        vaultState.hasUnsavedChanges = true;
    });

    searchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        renderAccounts(searchTerm);
    });

    saveAndLockBtn.addEventListener("click", async () => {
        try {
            const password = masterPasswordInput.value;
            if (!password) {
                alert("Master password seems to be missing. Cannot save.");
                return;
            }

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await getKey(password, salt);
            const dataToEncrypt = JSON.stringify(vaultState.decryptedVault);
            const ciphertext = await encrypt(key, iv, dataToEncrypt);

            const vaultToSave = {
                salt: arrayBufferToBase64(salt),
                iv: arrayBufferToBase64(iv),
                ciphertext: arrayBufferToBase64(ciphertext)
            };

            const dataStr = JSON.stringify(vaultToSave, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "my-secure-vault.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // 3. Fix Save/Reload: Turn off the flag BEFORE navigating
            vaultState.hasUnsavedChanges = false;

            clearTimeout(vaultState.autoLockTimer);

            // Add a tiny delay to ensure download starts before navigation
            setTimeout(() => {
                const homeBtn = document.getElementById('home-btn');
                if (homeBtn) homeBtn.click();
                else location.reload(); // Fallback if no home button
            }, 100);

        } catch (err) {
            console.error("Save failed:", err);
            alert("Could not save vault. See console for details.");
        }
    });

    exportCsvBtn.addEventListener("click", () => {
        if (vaultState.decryptedVault.length === 0) {
            alert("Vault is empty, nothing to export.");
            return;
        }

        let csvContent = "Website,Username,Emails,Note\n";

        const escapeCSV = (str) => {
            if (!str) return '""';
            return `"${str.replace(/"/g, '""')}"`;
        };

        vaultState.decryptedVault.forEach(account => {
            const website = escapeCSV(account.website);
            const username = escapeCSV(account.username);
            const emails = escapeCSV(account.emails ? account.emails.join('; ') : '');
            const note = escapeCSV(account.note);

            csvContent += `${website},${username},${emails},${note}\n`;
        });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-vault-reference.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Handle Unsaved Changes warning
    window.addEventListener('beforeunload', (e) => {
        if (vaultState.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Input listeners for unsaved changes flag
    addAccountForm.addEventListener('input', () => { vaultState.hasUnsavedChanges = true; });
    editAccountForm.addEventListener('input', () => { vaultState.hasUnsavedChanges = true; });

    // --- HELPER FUNCTIONS ---

    function resetVaultUI() {
        // Reset variables for a fresh login attempt
        vaultState.decryptedVault = [];
        vaultState.currentMasterKey = null;
        vaultState.hasUnsavedChanges = false;

        // Reset UI
        loginView.style.display = "block";
        vaultView.style.display = "none";
        masterPasswordInput.value = "";
        vaultFileInput.value = "";
        loginError.style.display = "none";
        accountListDiv.innerHTML = "";
    }

    function addEmailInput(container, email = "") {
        const newEmailGroup = document.createElement("div");
        newEmailGroup.className = "email-input-group";

        const newEmailInput = document.createElement("input");
        newEmailInput.type = "email";
        newEmailInput.className = "acc-email";
        newEmailInput.placeholder = "Another Email";
        newEmailInput.value = email;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove-email-btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
            newEmailGroup.remove();
        });

        newEmailGroup.appendChild(newEmailInput);
        newEmailGroup.appendChild(removeBtn);
        container.appendChild(newEmailGroup);
    }

    function migrateVaultData(vault) {
        return vault.map(account => {
            if (account.emails) { return account; }
            if (account.email) {
                return {
                    website: account.website,
                    username: account.username,
                    password: account.password,
                    note: account.note,
                    emails: [account.email]
                };
            }
            return account;
        });
    }

    function showError(message) {
        loginError.textContent = message;
        loginError.style.display = "block";
    }

    function showVaultView() {
        loginView.style.display = "none";
        vaultView.style.display = "block";
    }

    function startAutoLockTimer() {
        clearTimeout(vaultState.autoLockTimer);
        vaultState.autoLockTimer = setTimeout(() => {
            if (vaultView.style.display === 'block') {
                if (vaultState.hasUnsavedChanges) {
                    alert("Unsaved changes detected. Timer reset.");
                    startAutoLockTimer();
                } else {
                    const homeBtn = document.getElementById('home-btn');
                    if (homeBtn) homeBtn.click();
                }
            }
        }, 600000);
    }

    // Reset timer on activity
    document.body.addEventListener('mousemove', startAutoLockTimer);
    document.body.addEventListener('keypress', startAutoLockTimer);

    function renderAccounts(searchTerm = "") {
        accountListDiv.innerHTML = "";

        const filteredVault = vaultState.decryptedVault.filter(account => {
            const emails = (account.emails || []).join(' ');
            const searchString = `${account.website} ${account.username} ${emails} ${account.note}`.toLowerCase();
            return searchString.includes(searchTerm);
        });

        if (filteredVault.length === 0) {
            accountListDiv.innerHTML = "<p>No accounts found.</p>";
            return;
        }

        filteredVault.forEach(account => {
            // Find the *actual* index in the main array, not the filtered one
            const originalIndex = vaultState.decryptedVault.indexOf(account);

            const item = document.createElement("div");
            item.className = "account-item";

            let emailsHtml = 'N/A';
            if (account.emails && account.emails.length > 0) {
                emailsHtml = account.emails.join(', ');
            }

            item.innerHTML = `
                <div class="account-header" data-index="${originalIndex}">
                    <strong>${account.website}</strong>
                    <span class="toggle-arrow">▶</span>
                </div>
                <div class="account-details">
                    <p><strong>Emails:</strong> ${emailsHtml}</p>
                    <p><strong>User:</strong> ${account.username || 'N/A'}</p>
                    
                    <p class="password-display">
                        <strong>Pass: </strong>
                        <span class="password-text" data-password="${account.password || ''}">********</span>
                        <span class="password-toggle" data-state="hidden">👁️ Show</span>
                    </p>

                    <p><strong>Note:</strong> ${account.note || 'N/A'}</p>
                    <button class="copy-pass-btn" data-index="${originalIndex}">Copy Password</button>
                    <button class="edit-btn" data-index="${originalIndex}">Edit</button>
                    <button class="delete-btn" data-index="${originalIndex}">Delete</button>
                </div>
            `;
            accountListDiv.appendChild(item);
        });
    }

    function generatePassword(length = 20) {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
        let password = "";
        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);
        for (let i = 0; i < length; i++) {
            password += charset[randomValues[i] % charset.length];
        }
        return password;
    }

    function openEditModal(index) {
        const account = vaultState.decryptedVault[index];

        document.getElementById("edit-acc-index").value = index;
        document.getElementById("edit-acc-website").value = account.website;
        document.getElementById("edit-acc-username").value = account.username || "";
        document.getElementById("edit-acc-password").value = account.password || "";
        document.getElementById("edit-acc-note").value = account.note || "";

        const editEmailContainer = document.getElementById("edit-email-inputs-container");
        editEmailContainer.innerHTML = "";
        if (account.emails && account.emails.length > 0) {
            account.emails.forEach(email => {
                addEmailInput(editEmailContainer, email);
            });
        } else {
            addEmailInput(editEmailContainer);
        }

        editModalBackdrop.style.display = "flex";
    }

    function closeEditModal() {
        editModalBackdrop.style.display = "none";
        editAccountForm.reset();
    }

    async function getKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    async function encrypt(key, iv, data) {
        const enc = new TextEncoder();
        return crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            key,
            enc.encode(data)
        );
    }

    async function decrypt(key, iv, ciphertext) {
        const dec = new TextDecoder();
        try {
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                key,
                ciphertext
            );
            return dec.decode(decrypted);
        } catch (err) {
            throw new Error("Decryption failed. Probably wrong password.");
        }
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

if (typeof initVaultModule === 'function') {
    initVaultModule();
}