// Antigravity Meme Drawer (Core Engine)
// Pure, decoupled, theme-agnostic implementation for Google Antigravity

(() => {
    if (window.__antigravityMemeSystemLoaded) return;
    window.__antigravityMemeSystemLoaded = true;

    const DEFAULT_MEMES = window.__DEFAULT_PRESET_MEMES || [];
    const IDB_NAME = 'ag_meme_picker_db';
    const IDB_STORE = 'custom_memes';
    const IDB_KEY = 'meme_list';

    let customMemesCache = readLegacyLocalStorage();
    let idbReady = false;

    function readLegacyLocalStorage() {
        try {
            const raw = localStorage.getItem('ag_custom_memes');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function openMemeDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function initCustomMemesStorage() {
        try {
            const db = await openMemeDB();
            const list = await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const getReq = store.get(IDB_KEY);
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => reject(getReq.error);
            });

            if (Array.isArray(list)) {
                customMemesCache = list;
            } else if (customMemesCache.length > 0) {
                // Migrate legacy localStorage data to IndexedDB
                await persistToIDB(customMemesCache);
                try { localStorage.removeItem('ag_custom_memes'); } catch (_) {}
            }
            idbReady = true;
        } catch (e) {
            console.warn('[MemePicker] IndexedDB fallback to memory/localStorage:', e);
        }
    }

    async function persistToIDB(list) {
        const db = await openMemeDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const putReq = store.put(list, IDB_KEY);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        });
    }

    function getCustomMemes() {
        return customMemesCache;
    }

    function saveCustomMemes(list) {
        customMemesCache = list;
        if (idbReady || window.indexedDB) {
            persistToIDB(list).catch((e) => {
                console.error('[MemePicker] IndexedDB save error:', e);
            });
        } else {
            try {
                localStorage.setItem('ag_custom_memes', JSON.stringify(list));
            } catch (e) {
                console.error('[MemePicker] localStorage save error:', e);
            }
        }
    }

    let currentPack = 'default';
    let searchQuery = '';
    let pickerEl = null;
    let autoSendPref = localStorage.getItem('ag_meme_auto_send') !== 'false';

    const SMILE_ICON_SVG = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/>
            <circle cx="8.5" cy="9.5" r="1.3" fill="currentColor"/>
            <circle cx="15.5" cy="9.5" r="1.3" fill="currentColor"/>
            <path d="M7.8 14.5C8.8 16.8 11.2 18 12 18C12.8 18 15.2 16.8 16.2 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
    `;

    function ensureStyles() {
        if (document.getElementById('ag-meme-isolated-styles')) return;
        const style = document.createElement('style');
        style.id = 'ag-meme-isolated-styles';
        style.textContent = `
            .ag-chat-sticker {
                width: fit-content !important;
                max-width: 140px !important;
                display: block !important;
                margin: 6px 0 !important;
            }
            .ag-chat-sticker > div:first-child {
                max-width: 140px !important;
                width: fit-content !important;
                border: none !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .ag-chat-sticker img {
                max-width: 140px !important;
                max-height: 140px !important;
                width: 140px !important;
                height: auto !important;
                border-radius: 12px !important;
                object-fit: contain !important;
                filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35)) !important;
            }
            .ag-chat-sticker > div:last-child:not(:has(img)) {
                display: none !important;
            }
            .ag-chat-sticker > div:first-child button {
                opacity: 0 !important;
                transition: opacity 0.15s ease !important;
            }
            .ag-chat-sticker:hover > div:first-child button {
                opacity: 1 !important;
            }

            #ag-meme-picker {
                position: fixed;
                z-index: 999999;
                width: 440px;
                max-width: calc(100vw - 20px);
                background: var(--popover, #181324);
                color: var(--popover-foreground, #f3e8ff);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 16px;
                box-shadow: 0 20px 48px -6px rgba(0, 0, 0, 0.6), 0 0 24px rgba(168, 85, 247, 0.18);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: inherit;
                animation: agMemeFadeIn 0.14s cubic-bezier(0.16, 1, 0.3, 1);
                user-select: none;
                box-sizing: border-box;
            }
            #ag-meme-picker * {
                box-sizing: border-box;
            }
            @keyframes agMemeFadeIn {
                from { opacity: 0; transform: translateY(6px) scale(0.97); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .ag-meme-topbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.15);
            }
            .ag-meme-search-box {
                flex: 1;
                display: flex;
                align-items: center;
                position: relative;
            }
            .ag-meme-search-input {
                width: 100%;
                height: 30px;
                padding: 0 10px 0 28px;
                font-size: 12px;
                background: rgba(255, 255, 255, 0.07);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #ffffff;
                outline: none;
                transition: all 0.15s ease;
            }
            .ag-meme-search-input:focus {
                border-color: rgba(168, 85, 247, 0.6);
                background: rgba(255, 255, 255, 0.1);
            }
            .ag-meme-search-icon {
                position: absolute;
                left: 8px;
                opacity: 0.45;
                pointer-events: none;
            }
            .ag-meme-counter {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.45);
                white-space: nowrap;
                padding: 0 4px;
            }
            .ag-meme-btn-import {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(168, 85, 247, 0.18);
                color: #d8b4fe;
                border: 1px solid rgba(168, 85, 247, 0.35);
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .ag-meme-btn-import:hover {
                background: rgba(168, 85, 247, 0.3);
                border-color: rgba(168, 85, 247, 0.6);
            }
            .ag-meme-btn-close {
                background: transparent;
                border: none;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                padding: 4px 6px;
                font-size: 15px;
                border-radius: 6px;
                line-height: 1;
                transition: all 0.15s ease;
            }
            .ag-meme-btn-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }

            .ag-meme-grid-viewport {
                max-height: 280px;
                min-height: 160px;
                overflow-y: auto;
                padding: 10px;
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
            }
            .ag-meme-grid-viewport::-webkit-scrollbar {
                width: 5px;
            }
            .ag-meme-grid-viewport::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            .ag-meme-grid {
                display: grid !important;
                grid-template-columns: repeat(5, 1fr) !important;
                gap: 8px !important;
                width: 100% !important;
            }
            .ag-meme-card {
                position: relative;
                aspect-ratio: 1 / 1;
                width: 100% !important;
                max-width: none !important;
                min-width: 0 !important;
                display: flex !important;
                align-items: center;
                justify-content: center;
                padding: 6px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.16s ease;
            }
            .ag-meme-card:hover {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(168, 85, 247, 0.45);
                transform: translateY(-2px) scale(1.05);
                box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
            }
            .ag-meme-card:active {
                transform: scale(0.96);
            }
            .ag-meme-card img {
                width: 100% !important;
                height: 100% !important;
                max-width: 100% !important;
                max-height: 100% !important;
                object-fit: contain !important;
                pointer-events: none;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
            }
            .ag-meme-card-delete {
                position: absolute;
                top: 2px;
                right: 2px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: rgba(239, 68, 68, 0.85);
                color: #ffffff;
                display: none;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                line-height: 1;
                cursor: pointer;
            }
            .ag-meme-card:hover .ag-meme-card-delete {
                display: flex;
            }
            .ag-meme-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 36px 12px;
                color: rgba(255, 255, 255, 0.4);
                font-size: 12px;
                gap: 8px;
            }

            .ag-meme-bottombar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                background: rgba(0, 0, 0, 0.25);
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                font-size: 11px;
            }
            .ag-meme-tabs {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .ag-meme-tab {
                padding: 3px 8px;
                border-radius: 6px;
                background: transparent;
                border: 1px solid transparent;
                color: rgba(255, 255, 255, 0.6);
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .ag-meme-tab.active {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.18);
                color: #ffffff;
                font-weight: 500;
            }
            .ag-meme-tab:hover:not(.active) {
                background: rgba(255, 255, 255, 0.06);
                color: rgba(255, 255, 255, 0.85);
            }
            .ag-meme-autosend-toggle {
                display: flex;
                align-items: center;
                gap: 5px;
                color: rgba(255, 255, 255, 0.7);
                cursor: pointer;
            }
            .ag-meme-autosend-toggle input {
                accent-color: #a855f7;
                cursor: pointer;
            }
            #ag-meme-trigger-btn {
                margin-left: 2px;
            }
            #ag-meme-trigger-btn:hover {
                color: #c084fc !important;
            }
        `;
        document.head.appendChild(style);
    }

    function closePicker() {
        if (pickerEl && pickerEl.parentElement) {
            pickerEl.parentElement.removeChild(pickerEl);
            pickerEl = null;
        }
    }

    function positionPicker(triggerBtn) {
        if (!pickerEl || !triggerBtn) return;
        const rect = triggerBtn.getBoundingClientRect();
        const pickerWidth = 440;
        const pickerHeight = 360;

        let left = rect.left - 6;
        if (left + pickerWidth > window.innerWidth - 12) {
            left = window.innerWidth - pickerWidth - 12;
        }
        if (left < 12) left = 12;

        let bottom = window.innerHeight - rect.top + 12;
        if (bottom + pickerHeight > window.innerHeight) {
            pickerEl.style.bottom = 'auto';
            pickerEl.style.top = `${rect.bottom + 10}px`;
        } else {
            pickerEl.style.top = 'auto';
            pickerEl.style.bottom = `${bottom}px`;
        }
        pickerEl.style.left = `${left}px`;
    }

    function handleMemeSelect(meme, isShiftClick) {
        const editor = document.querySelector('div[data-lexical-editor="true"]');
        if (!editor) {
            closePicker();
            return;
        }

        const tagText = meme.tag || `[表情: ${meme.name}]`;
        const shouldSend = autoSendPref && !isShiftClick;

        editor.focus();

        const dt = new DataTransfer();
        dt.setData('text/plain', tagText);
        const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
        });
        editor.dispatchEvent(pasteEvent);

        closePicker();

        if (shouldSend) {
            const isGenerating = !!document.querySelector('[data-testid="input-cancel-button"]');
            if (isGenerating) return;

            setTimeout(() => {
                editor.focus();
                const submitBtn = document.querySelector('[data-testid="input-submit-button"]') ||
                                  document.querySelector('button[aria-label="Send"]') ||
                                  document.querySelector('button[aria-label="Submit"]');
                if (submitBtn && !submitBtn.disabled) {
                    submitBtn.click();
                } else {
                    const enterEvt = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    editor.dispatchEvent(enterEvt);
                }
            }, 60);
        }
    }

    function compressImageFile(file, maxSize = 160) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('File read failed'));
            reader.onload = (e) => {
                const rawUrl = e.target.result;
                // Keep animated GIF as-is if reasonably small, otherwise canvas-compress static images to WebP
                if (file.type === 'image/gif' && file.size <= 512 * 1024) {
                    resolve(rawUrl);
                    return;
                }
                const img = new Image();
                img.onerror = () => reject(new Error('Image decode failed'));
                img.onload = () => {
                    let w = img.naturalWidth || img.width;
                    let h = img.naturalHeight || img.height;
                    if (!w || !h) {
                        resolve(rawUrl);
                        return;
                    }
                    if (w > maxSize || h > maxSize) {
                        const scale = maxSize / Math.max(w, h);
                        w = Math.max(1, Math.round(w * scale));
                        h = Math.max(1, Math.round(h * scale));
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const compressed = canvas.toDataURL('image/webp', 0.82);
                    resolve(compressed.startsWith('data:image/webp') ? compressed : canvas.toDataURL('image/png'));
                };
                img.src = rawUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    async function handleImportFiles(files) {
        if (!files || !files.length) return;
        const imageFiles = Array.from(files).filter(f => f.type && f.type.startsWith('image/'));
        if (!imageFiles.length) return;

        const customList = [...getCustomMemes()];
        const results = await Promise.allSettled(
            imageFiles.map(async (file) => {
                const name = file.name.replace(/\.[^/.]+$/, '') || 'sticker';
                const dataUri = await compressImageFile(file, 160);
                return {
                    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    name: name,
                    tag: `[表情: ${name}]`,
                    preview: dataUri
                };
            })
        );

        let added = 0;
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value) {
                customList.push(res.value);
                added++;
            }
        });

        if (added > 0) {
            saveCustomMemes(customList);
            currentPack = 'custom';
            renderPickerContent();
        }
    }

    function renderPickerContent() {
        if (!pickerEl) return;

        const allMemes = currentPack === 'default' ? DEFAULT_MEMES : getCustomMemes();
        const filtered = allMemes.filter(m => {
            if (!searchQuery) return true;
            return m.name.toLowerCase().includes(searchQuery.toLowerCase());
        });

        const counterEl = pickerEl.querySelector('.ag-meme-counter');
        if (counterEl) {
            counterEl.textContent = `共 ${filtered.length} 张`;
        }

        const gridContainer = pickerEl.querySelector('.ag-meme-grid-viewport');
        if (!gridContainer) return;

        gridContainer.replaceChildren();

        if (filtered.length === 0) {
            const emptyBox = document.createElement('div');
            emptyBox.className = 'ag-meme-empty';
            const emptyText = document.createElement('span');
            emptyText.textContent = searchQuery ? '未找到相关表情' : '该图库暂无表情，可点击右上角导入';
            emptyBox.appendChild(emptyText);
            gridContainer.appendChild(emptyBox);
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'ag-meme-grid';

        filtered.forEach(meme => {
            const card = document.createElement('div');
            card.className = 'ag-meme-card';
            card.title = `${meme.name} (点击发送，Shift+点击插入)`;

            const img = document.createElement('img');
            img.src = meme.preview;
            img.alt = meme.name;
            img.loading = 'lazy';
            card.appendChild(img);

            if (currentPack === 'custom') {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'ag-meme-card-delete';
                delBtn.title = '删除此表情';
                delBtn.textContent = '✕';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    const list = getCustomMemes().filter(x => x.id !== meme.id);
                    saveCustomMemes(list);
                    renderPickerContent();
                };
                card.appendChild(delBtn);
            }

            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('ag-meme-card-delete')) return;
                handleMemeSelect(meme, e.shiftKey);
            });

            grid.appendChild(card);
        });

        gridContainer.appendChild(grid);
    }

    function openPicker(triggerBtn) {
        if (pickerEl) {
            closePicker();
            return;
        }

        ensureStyles();
        searchQuery = '';

        pickerEl = document.createElement('div');
        pickerEl.id = 'ag-meme-picker';

        const topbar = document.createElement('div');
        topbar.className = 'ag-meme-topbar';
        topbar.innerHTML = `
            <div class="ag-meme-search-box">
                <svg class="ag-meme-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input type="text" class="ag-meme-search-input" placeholder="搜索描述 / 关键词..." />
            </div>
            <span class="ag-meme-counter">共 0 张</span>
            <button class="ag-meme-btn-import" title="导入本地自定义图片">➕ 导入</button>
            <button class="ag-meme-btn-close" title="关闭 (Esc)">✕</button>
        `;

        const searchInput = topbar.querySelector('.ag-meme-search-input');
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderPickerContent();
        });

        const importBtn = topbar.querySelector('.ag-meme-btn-import');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', (e) => {
            handleImportFiles(e.target.files);
        });

        importBtn.onclick = () => fileInput.click();
        topbar.querySelector('.ag-meme-btn-close').onclick = closePicker;

        const viewport = document.createElement('div');
        viewport.className = 'ag-meme-grid-viewport';

        const bottombar = document.createElement('div');
        bottombar.className = 'ag-meme-bottombar';
        bottombar.innerHTML = `
            <div class="ag-meme-tabs">
                <button class="ag-meme-tab ${currentPack === 'default' ? 'active' : ''}" data-pack="default">默认</button>
                <button class="ag-meme-tab ${currentPack === 'custom' ? 'active' : ''}" data-pack="custom">我的收藏</button>
            </div>
            <label class="ag-meme-autosend-toggle" title="开启后点击表情直接发送">
                <input type="checkbox" id="ag-meme-autosend-cb" ${autoSendPref ? 'checked' : ''} />
                <span>点击直接发送</span>
            </label>
        `;

        bottombar.querySelectorAll('.ag-meme-tab').forEach(tab => {
            tab.onclick = () => {
                bottombar.querySelectorAll('.ag-meme-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentPack = tab.dataset.pack;
                renderPickerContent();
            };
        });

        const autoSendCb = bottombar.querySelector('#ag-meme-autosend-cb');
        autoSendCb.onchange = (e) => {
            autoSendPref = e.target.checked;
            localStorage.setItem('ag_meme_auto_send', autoSendPref ? 'true' : 'false');
        };

        pickerEl.appendChild(topbar);
        pickerEl.appendChild(viewport);
        pickerEl.appendChild(bottombar);

        document.body.appendChild(pickerEl);
        positionPicker(triggerBtn);
        renderPickerContent();

        setTimeout(() => searchInput.focus(), 50);
    }

    function mountMemeButton() {
        if (document.getElementById('ag-meme-trigger-btn')) return;

        const addBtn = document.querySelector('button[aria-label="Add context"]');
        if (!addBtn || !addBtn.parentElement) return;

        const btn = document.createElement('button');
        btn.id = 'ag-meme-trigger-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', '表情包');
        btn.setAttribute('data-no-drag', '');
        btn.title = '表情包';
        btn.className = 'ag-meme-btn p-1.5 rounded-full text-secondary-foreground hover:bg-secondary cursor-pointer transition-colors flex items-center justify-center';
        btn.innerHTML = SMILE_ICON_SVG;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openPicker(btn);
        });

        addBtn.parentElement.insertBefore(btn, addBtn.nextSibling);
    }

    function collectMatchingElements(root, selector) {
        const list = [];
        if (root.matches && root.matches(selector)) {
            list.push(root);
        }
        if (root.querySelectorAll) {
            root.querySelectorAll(selector).forEach(el => list.push(el));
        }
        return list;
    }

    function createStickerImg(src, name, size, isInline) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = name;
        img.title = `[表情: ${name}]`;
        if (isInline) {
            img.style.cssText = 'display:inline-block; width:52px; height:52px; vertical-align:middle; margin:0 4px; object-fit:contain; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.22));';
        } else {
            img.style.cssText = `width:${size}px; height:${size}px; object-fit:contain; filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3));`;
        }
        return img;
    }

    const EXCLUDED_SELECTOR = 'code, pre, textarea, input, script, style, noscript, [contenteditable="true"], [data-lexical-editor="true"], .monaco-editor, .cm-editor, #ag-meme-picker';
    const BLOCK_CONTAINER_SELECTOR = '.whitespace-pre-wrap, p, li, blockquote, td, dd';

    function collectEligibleTextNodes(container) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue) continue;
            if (node.parentElement && node.parentElement.closest(EXCLUDED_SELECTOR)) {
                continue;
            }
            textNodes.push(node);
        }
        return textNodes;
    }

    function replaceMemesAcrossTextNodes(textNodes, memeMap) {
        if (!textNodes.length) return false;

        let fullText = '';
        const segments = [];
        for (const node of textNodes) {
            const start = fullText.length;
            const val = node.nodeValue || '';
            fullText += val;
            segments.push({ node, start, end: fullText.length });
        }

        if (!fullText.includes('[表情:')) return false;

        const tagRegex = /\[表情:\s*([^\]]+)\]/g;
        const matches = [];
        let match;
        while ((match = tagRegex.exec(fullText)) !== null) {
            const name = match[1].trim();
            const src = memeMap[name];
            if (!src) continue;
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                name,
                src
            });
        }

        if (!matches.length) return false;

        const findSegmentIndex = (offset, isEnd) => {
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                if (isEnd ? (offset > seg.start && offset <= seg.end) : (offset >= seg.start && offset < seg.end)) {
                    return i;
                }
            }
            return -1;
        };

        let replacedAny = false;
        // Process from right to left so earlier character offsets remain valid
        for (let mIdx = matches.length - 1; mIdx >= 0; mIdx--) {
            const m = matches[mIdx];
            const startSegIdx = findSegmentIndex(m.start, false);
            const endSegIdx = findSegmentIndex(m.end, true);
            if (startSegIdx === -1 || endSegIdx === -1) continue;

            const startSeg = segments[startSegIdx];
            const endSeg = segments[endSegIdx];
            const startOffset = m.start - startSeg.start;
            const endOffset = m.end - endSeg.start;

            const img = createStickerImg(m.src, m.name, 52, true);
            img.dataset.agMemeImg = 'true';

            if (startSegIdx === endSegIdx) {
                const textNode = startSeg.node;
                const val = textNode.nodeValue || '';
                const before = val.slice(0, startOffset);
                const after = val.slice(endOffset);
                const parent = textNode.parentNode;
                if (!parent) continue;

                textNode.nodeValue = before;
                if (after) {
                    const afterNode = document.createTextNode(after);
                    parent.insertBefore(afterNode, textNode.nextSibling);
                    parent.insertBefore(img, afterNode);
                } else {
                    parent.insertBefore(img, textNode.nextSibling);
                }
                replacedAny = true;
            } else {
                // Cross-node match (e.g. streaming markdown tokens split across sibling <span> or text nodes)
                // Mutate nodeValue in-place rather than removing <span> elements so React's fiber tree stays intact
                const startNode = startSeg.node;
                const endNode = endSeg.node;
                if (!startNode.parentNode) continue;

                const startVal = startNode.nodeValue || '';
                const endVal = endNode.nodeValue || '';
                startNode.nodeValue = startVal.slice(0, startOffset);
                for (let i = startSegIdx + 1; i < endSegIdx; i++) {
                    segments[i].node.nodeValue = '';
                }
                endNode.nodeValue = endVal.slice(endOffset);
                startNode.parentNode.insertBefore(img, startNode.nextSibling);
                replacedAny = true;
            }
        }

        return replacedAny;
    }

    function replaceInlineMemesInElement(el, memeMap) {
        const walkRoot = el === document ? document.body : el;
        if (!walkRoot) return false;

        let replacedAny = false;
        const handledNodes = new Set();

        // 1. Handle block containers first so tags split across streaming <span> / text nodes match together
        const blocks = collectMatchingElements(walkRoot, BLOCK_CONTAINER_SELECTOR);
        blocks.forEach(block => {
            if (block.closest(EXCLUDED_SELECTOR)) return;
            const text = block.textContent || '';
            if (!text.includes('[表情:')) return;

            const blockTextNodes = collectEligibleTextNodes(block).filter(n => !handledNodes.has(n));
            if (blockTextNodes.length) {
                blockTextNodes.forEach(n => handledNodes.add(n));
                if (replaceMemesAcrossTextNodes(blockTextNodes, memeMap)) {
                    replacedAny = true;
                }
            }
        });

        // 2. Fallback for any remaining text nodes outside standard block tags
        const remainingNodes = collectEligibleTextNodes(walkRoot).filter(
            n => !handledNodes.has(n) && n.nodeValue.includes('[表情:')
        );
        remainingNodes.forEach(textNode => {
            if (replaceMemesAcrossTextNodes([textNode], memeMap)) {
                replacedAny = true;
            }
        });

        return replacedAny;
    }

    function renderChatMemes(rootEl = document) {
        const defaultMemes = window.__DEFAULT_PRESET_MEMES || [];
        const customMemes = getCustomMemes();
        const allMemes = [...defaultMemes, ...customMemes];
        if (!allMemes.length) return;

        const memeMap = {};
        const memeNames = new Set();
        allMemes.forEach(m => {
            memeMap[m.name] = m.preview;
            memeNames.add(m.name);
        });

        collectMatchingElements(rootEl, '[class*="group/media"]').forEach(mediaEl => {
            if (mediaEl.classList.contains('ag-chat-sticker')) return;
            const img = mediaEl.querySelector('img[alt]');
            if (!img) return;
            const alt = (img.getAttribute('alt') || '').trim();
            if (memeNames.has(alt) || /^(?:表情|meme|sticker)[:：\s]/i.test(alt)) {
                mediaEl.classList.add('ag-chat-sticker');
            }
        });

        // 1. Standalone pure-sticker bubbles (120px single / 96px multi)
        const standaloneCandidates = collectMatchingElements(rootEl, '.whitespace-pre-wrap, p, li');
        standaloneCandidates.forEach(el => {
            if (el.closest(EXCLUDED_SELECTOR) || el.closest('button, nav')) return;
            const text = el.textContent || '';
            if (!text.includes('[表情:')) return;

            const hasCodeChild = !!el.querySelector('code, pre');
            const withoutMemes = text.replace(/\[表情:\s*([^\]]+)\]/g, '').trim();
            if (!hasCodeChild && !withoutMemes) {
                const matches = [...text.matchAll(/\[表情:\s*([^\]]+)\]/g)];
                const validNames = matches.map(m => m[1].trim()).filter(name => memeMap[name]);
                if (validNames.length === matches.length && validNames.length > 0) {
                    const size = validNames.length === 1 ? 120 : 96;
                    const container = document.createElement('div');
                    container.className = 'ag-standalone-bubble-meme';
                    container.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-start; gap:6px; padding:2px;';
                    validNames.forEach(name => {
                        container.appendChild(createStickerImg(memeMap[name], name, size, false));
                    });
                    el.replaceChildren(container);
                }
            }
        });

        // 2. Inline mixed-text stickers across any chat/markdown container (selector-agnostic)
        replaceInlineMemesInElement(rootEl, memeMap);
    }

    document.addEventListener('pointerdown', (e) => {
        if (!pickerEl) return;
        const triggerBtn = document.getElementById('ag-meme-trigger-btn');
        if (pickerEl.contains(e.target) || (triggerBtn && triggerBtn.contains(e.target))) {
            return;
        }
        closePicker();
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && pickerEl) {
            closePicker();
        }
    });

    window.addEventListener('resize', () => {
        if (pickerEl) {
            const triggerBtn = document.getElementById('ag-meme-trigger-btn');
            positionPicker(triggerBtn);
        }
    });

    ensureStyles();
    mountMemeButton();
    renderChatMemes(document);

    initCustomMemesStorage().then(() => {
        renderChatMemes(document);
        if (pickerEl && currentPack === 'custom') {
            renderPickerContent();
        }
    });

    const pendingNodes = new Set();
    let rafScheduled = false;
    let settleTimer = null;

    function queueScanTarget(node) {
        if (!node) return;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!el || !el.isConnected) return;
        const block = el.closest(BLOCK_CONTAINER_SELECTOR);
        pendingNodes.add(block || el);
    }

    function flushPendingMutations() {
        rafScheduled = false;
        if (!document.getElementById('ag-meme-trigger-btn')) {
            mountMemeButton();
        }
        pendingNodes.forEach(node => {
            if (node.isConnected) {
                renderChatMemes(node);
            }
        });
        pendingNodes.clear();
    }

    const obs = new MutationObserver((mutations) => {
        let hasWork = false;
        for (const m of mutations) {
            if (m.type === 'characterData') {
                queueScanTarget(m.target);
                hasWork = true;
                continue;
            }
            if (m.removedNodes && m.removedNodes.length > 0) {
                queueScanTarget(m.target);
                hasWork = true;
            }
            for (const added of m.addedNodes) {
                if (added.nodeType === Node.ELEMENT_NODE) {
                    queueScanTarget(added);
                    hasWork = true;
                } else if (added.nodeType === Node.TEXT_NODE) {
                    queueScanTarget(m.target);
                    hasWork = true;
                }
            }
        }
        if (hasWork) {
            if (!rafScheduled) {
                rafScheduled = true;
                requestAnimationFrame(flushPendingMutations);
            }
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(() => {
                settleTimer = null;
                renderChatMemes(document);
            }, 300);
        }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
