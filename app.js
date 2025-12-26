document.addEventListener('DOMContentLoaded', () => {

    // --- This is the entire loadScript function. Note where it ends. ---
    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            // Check if script already exists from a previous load
            if (document.getElementById(id)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.id = id;
            script.src = src; // Use .src to make it load and execute
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.body.appendChild(script);
        });
    } // <--- FIX 1: The loadScript function MUST end here.


    // --- The rest of your app logic starts here, OUTSIDE loadScript ---
    const appGrid = document.getElementById('app-grid');
    const appContent = document.getElementById('app-content');
    const homeBtn = document.getElementById('home-btn');

    // This object maps icon IDs to their module names
    const modules = {
        'launch-vault': 'vault',
        'launch-tracker': 'tracker',
        'launch-lister': 'lister',
        'launch-focus': 'focus'
    };

    appGrid.addEventListener('click', (e) => {
        const icon = e.target.closest('.app-icon');
        if (icon && icon.id && modules[icon.id] && !icon.classList.contains('app-icon-disabled')) {
            loadModule(modules[icon.id]);
        }
    });

    homeBtn.addEventListener('click', () => {
        goHome();
    });

    async function loadModule(moduleName) {
        appContent.innerHTML = '';

        try {
            // 1. Fetch HTML
            const htmlRes = await fetch(`modules/${moduleName}/${moduleName}.html`);
            if (!htmlRes.ok) throw new Error(`HTML file not found: ${htmlRes.status}`);
            const html = await htmlRes.text();

            // 2. Fetch CSS
            const cssRes = await fetch(`modules/${moduleName}/${moduleName}.css`);
            if (!cssRes.ok) throw new Error(`CSS file not found: ${cssRes.status}`);
            const css = await cssRes.text();

            // 3. Load required libraries (if any)
            // <--- FIX 2: This block is ONLY for loading EXTRA scripts. ---
            if (moduleName === 'tracker') {
                // We must load the Chart.js library BEFORE we load tracker.js
                await loadScript('modules/tracker/chart.js', 'tracker-chart-lib-script');
            }
            // NEW: Load the lister image handler before the main lister script
            if (moduleName === 'lister') {
                await loadScript(`modules/lister/lister.image.js`, 'lister-image-script');
            }

            // <--- FIX 2: These steps (4-8) must be OUTSIDE the if-block ---


            // 4. Fetch module JS
            const jsRes = await fetch(`modules/${moduleName}/${moduleName}.js`);
            if (!jsRes.ok) throw new Error(`JS file not found: ${jsRes.status}`);
            const js = await jsRes.text();

            // 5. Inject CSS
            const style = document.createElement('style');
            style.id = `${moduleName}-style`;
            style.textContent = css;
            document.head.appendChild(style);

            // 6. Inject HTML
            appContent.innerHTML = html;

            // 7. Inject module JS
            const script = document.createElement('script');
            script.id = `${moduleName}-script`;
            script.textContent = js;
            document.body.appendChild(script);

            // 8. Call the module's init function
            if (moduleName === 'vault' && typeof initVaultModule === 'function') {
                initVaultModule();
            } else if (moduleName === 'tracker' && typeof initTrackerModule === 'function') {
                initTrackerModule();
            } else if (moduleName === 'lister' && typeof initListerModule === 'function') {
                initListerModule();
            } else if (moduleName === 'focus' && typeof initFocusModule === 'function') {
                initFocusModule();
            }

            appGrid.classList.add('is-hidden');
            homeBtn.style.display = 'block';

        } catch (err) {
            console.error('Failed to load module:', err);
            appContent.innerHTML = `<h2>Error: Could not load ${moduleName}.</h2><p>${err.message}</p>`;
        }
    }

    function goHome() {
        appContent.innerHTML = '';

        // Clean up styles/scripts
        const mods = ['vault', 'tracker', 'lister'];
        mods.forEach(mod => {
            document.getElementById(`${mod}-style`)?.remove();
            document.getElementById(`${mod}-script`)?.remove();
            document.getElementById('lister-image-script')?.remove(); // Clean up the new script
        });
        document.getElementById('tracker-chart-lib-script')?.remove();

        appGrid.classList.remove('is-hidden');
        homeBtn.style.display = 'none';

        // Reload page to clear complex JS states
        location.reload();
    }
});