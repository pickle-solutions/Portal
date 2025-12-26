function initListerImageHandler(getPhotos, setPhotos, showToast) {

    // --- UTILS ---
    async function resizeImage(file) {
        // maxSize removed because we don't use it anymore.
        // Returns the exact original file (100% quality, original rotation).
        return Promise.resolve(file);
    }

    // PNG Converter (Required for Clipboard API compatibility)
    async function convertToPng(blob) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                canvas.toBlob((pngBlob) => resolve(pngBlob), 'image/png');
            };
        });
    }

    function blobToBase64(blob) {
        return new Promise((resolve) => {
            if (!(blob instanceof Blob)) { resolve(null); return; }
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
        });
    }
    async function base64ToBlob(base64) {
        try { return await (await fetch(base64)).blob(); } catch (e) { return null; }
    }

    // --- CLIPBOARD ---
    async function copyBlobToClipboard(blob) {
        try {
            showToast("Preparing image...");
            const pngBlob = await convertToPng(blob);
            const item = new ClipboardItem({ 'image/png': pngBlob });
            await navigator.clipboard.write([item]);
            showToast("Image Copied! Ready to Paste (Ctrl+V)");
        } catch (err) {
            console.error(err);
            showToast("Copy blocked. Try dragging image.");
        }
    }

    // --- PHOTO HANDLING ---
    function processFiles(files) {
        const currentPhotos = getPhotos();
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            currentPhotos.push(file);
        }
        setPhotos(currentPhotos);
        refreshPhotoGallery('lister-photo-preview-gallery');
    }

    function movePhoto(index, direction) {
        const currentPhotos = getPhotos();
        if (direction === -1 && index > 0) {
            [currentPhotos[index], currentPhotos[index - 1]] = [currentPhotos[index - 1], currentPhotos[index]];
        } else if (direction === 1 && index < currentPhotos.length - 1) {
            [currentPhotos[index], currentPhotos[index + 1]] = [currentPhotos[index + 1], currentPhotos[index]];
        }
        setPhotos(currentPhotos);
        refreshPhotoGallery('lister-photo-preview-gallery');
    }

    // --- MAIN GALLERY REFRESH (FIXED FOR DRAG) ---
    function refreshPhotoGallery(containerId) {
        const gallery = document.getElementById(containerId);
        if (!gallery) return;
        gallery.innerHTML = '';

        const currentPhotos = getPhotos();
        currentPhotos.forEach((file, index) => {
            const div = document.createElement('div');
            div.className = 'preview-wrapper';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.draggable = true; // Enable dragging

            // --- DRAG LOGIC FIX ---
            img.addEventListener('dragstart', (e) => {
                // 1. Stop browser from navigating to the blob URL (Fixes "Unload" error)
                e.dataTransfer.clearData();

                // 2. Create Synthetic File [cite: 84, 94]
                const mimeType = file.type || 'image/jpeg';
                const extension = mimeType.split('/')[1] || 'jpg';
                const syntheticFile = new File([file], `item_photo_${index}.${extension}`, {
                    type: mimeType,
                    lastModified: Date.now()
                });

                // 3. Inject File Object [cite: 84]
                if (e.dataTransfer.items) {
                    e.dataTransfer.items.add(syntheticFile);
                }

                // 4. Set Visuals
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setDragImage(img, 20, 20);
            });
            // ---------------------

            const overlay = document.createElement('div');
            overlay.className = 'preview-copy-overlay';
            overlay.textContent = "Drag to FB";
            div.onclick = () => copyBlobToClipboard(file);

            const delBtn = document.createElement('button');
            delBtn.className = 'preview-delete';
            delBtn.innerHTML = '×';
            delBtn.onclick = (e) => {
                e.stopPropagation(); e.preventDefault();
                const currentPhotos = getPhotos();
                currentPhotos.splice(index, 1);
                setPhotos(currentPhotos);
                refreshPhotoGallery(containerId);
            };

            const controls = document.createElement('div');
            controls.className = 'preview-controls';
            const leftBtn = document.createElement('button');
            leftBtn.className = 'arrow-btn'; leftBtn.innerHTML = '◄';
            leftBtn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); movePhoto(index, -1); };
            const rightBtn = document.createElement('button');
            rightBtn.className = 'arrow-btn'; rightBtn.innerHTML = '►';
            rightBtn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); movePhoto(index, 1); };

            controls.appendChild(leftBtn);
            controls.appendChild(rightBtn);

            div.appendChild(img);
            div.appendChild(overlay);
            div.appendChild(delBtn);
            div.appendChild(controls);
            gallery.appendChild(div);
        });
    }

    return {
        resizeImage,
        blobToBase64,
        base64ToBlob,
        copyBlobToClipboard,
        processFiles,
        refreshPhotoGallery
    };
}