const keyDictionary = {
    "A": 65, "B": 66, "C": 67, "D": 68, "E": 69, "F": 70, "G": 71, "H": 72, "I": 73, "J": 74, "K": 75, "L": 76, "M": 77, "N": 78, "O": 79, "P": 80, "Q": 81, "R": 82, "S": 83, "T": 84, "U": 85, "V": 86, "W": 87, "X": 88, "Y": 89, "Z": 90,
    "0": 48, "1": 49, "2": 50, "3": 51, "4": 52, "5": 53, "6": 54, "7": 55, "8": 56, "9": 57,
    "F1": 112, "F2": 113, "F3": 114, "F4": 115, "F5": 116, "F6": 117, "F7": 118, "F8": 119, "F9": 120, "F10": 121, "F11": 122, "F12": 123,
    "NUM0": 96, "NUM1": 97, "NUM2": 98, "NUM3": 99, "NUM4": 100, "NUM5": 101, "NUM6": 102, "NUM7": 103, "NUM8": 104, "NUM9": 105, "NUM*": 106, "NUM+": 107, "NUM-": 109, "NUM.": 110, "NUM/": 111,
    "BACKSPACE": 8, "TAB": 9, "ENTER": 13, "SHIFT": 16, "CTRL": 17, "ALT": 18, "CAPSLOCK": 20, "ESC": 27, "SPACE": 32, "PAGEUP": 33, "PAGEDOWN": 34, "END": 35, "HOME": 36, "ARROWLEFT": 37, "ARROWUP": 38, "ARROWRIGHT": 39, "ARROWDOWN": 40, "PRINTSCREEN": 44, "INSERT": 45, "DELETE": 46,
    "SCROLLLOCK": 145, "NUMLOCK": 144, "PAUSE": 19,
    ";": 186, "=": 187, ",": 188, "-": 189, ".": 190, "/": 191, "~": 192, "[": 219, "\\": 220, "]": 221, "'": 222      
};

let appData = { activeProfile: "Default", profiles: { "Default": [] }, settings: { autoApply: false } };
let editingKeyId = null;
let pairedMacropads = [];   // kept in sync by renderDevices, used to label macro bindings

let alertConfirmCallback = null;
function showCustomAlert(title, message, confirmText, confirmColor, callback) {
    document.getElementById('custom-alert-title').innerText = title;
    document.getElementById('custom-alert-title').style.color = confirmColor;
    document.getElementById('custom-alert-message').innerText = message;
    const confirmBtn = document.getElementById('custom-alert-confirm');
    confirmBtn.innerText = confirmText;
    confirmBtn.style.background = confirmColor;
    alertConfirmCallback = callback;
    document.getElementById('custom-alert-modal').classList.add('show');
}

function closeCustomAlert() {
    alertConfirmCallback = null;
    document.getElementById('custom-alert-modal').classList.remove('show');
}

document.getElementById('custom-alert-confirm').addEventListener('click', () => {
    if (alertConfirmCallback) alertConfirmCallback();
    closeCustomAlert();
});

let promptConfirmCallback = null;
function showCustomPrompt(title, placeholder, callback) {
    document.getElementById('custom-prompt-title').innerText = title;
    const input = document.getElementById('custom-prompt-input');
    input.placeholder = placeholder;
    input.value = ''; 
    promptConfirmCallback = callback;
    document.getElementById('custom-prompt-modal').classList.add('show');
    setTimeout(() => input.focus(), 100); 
}

function closeCustomPrompt() {
    promptConfirmCallback = null;
    document.getElementById('custom-prompt-modal').classList.remove('show');
}

document.getElementById('custom-prompt-confirm').addEventListener('click', () => {
    const val = document.getElementById('custom-prompt-input').value.trim();
    if (promptConfirmCallback) promptConfirmCallback(val);
    closeCustomPrompt();
});

document.getElementById('custom-prompt-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') document.getElementById('custom-prompt-confirm').click();
});

function connectMacropad() {
    pulseButton('connectBtn');
    window.electronAPI.startEngine();
    
    // Set to Waiting State
    const statusText = document.getElementById('status-text');
    statusText.innerText = "Status: Waiting for keypress...";
    statusText.style.color = "#d4a373"; // Orange warning color
    
    document.getElementById('connectBtn').style.display = "none";
    showToast("Press any key on your Macropad now!");
}

window.electronAPI.onShowCloseModal(() => { document.getElementById('close-modal').classList.add('show'); });
function handleClose(decision) {
    document.getElementById('close-modal').classList.remove('show');
    if (decision !== 'cancel') window.electronAPI.sendCloseDecision(decision);
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.style.backgroundColor = isError ? "#cc3300" : "#4CAF50";
    toast.className = "toast show";
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
}

function toggleAutoApply() {
    if (!appData.settings) appData.settings = { autoApply: false, showOSD: false }; 
    const isChecked = document.getElementById('auto-apply-toggle').checked;

    if (isChecked) {
        // Save the exact profile name to memory
        appData.settings.autoApply = appData.activeProfile; 
        showToast(`Startup profile set to: ${appData.activeProfile}`);
    } else {
        // Wipe it if they uncheck the box
        appData.settings.autoApply = false;
        showToast("Auto-Run on startup disabled.");
    }
    window.electronAPI.saveMacros(appData); 
}

function toggleOSD() {
    if (!appData.settings) appData.settings = { autoApply: false, showOSD: false }; 
    appData.settings.showOSD = document.getElementById('osd-toggle').checked;
    window.electronAPI.saveMacros(appData); 
    showToast("OSD setting saved!");
}

function toggleToastColor() {
    if (!appData.settings) appData.settings = {};
    appData.settings.toastColor = document.getElementById('toast-color').value;
    window.electronAPI.saveMacros(appData);
    showToast("Toast color saved!");
}

function toggleMinimizeTray() {
            if (!appData.settings) appData.settings = {}; 
            appData.settings.minimizeToTray = document.getElementById('minimize-tray-toggle').checked;
            window.electronAPI.saveMacros(appData); 
            showToast("Minimize setting saved!");
    }

// --- ACCORDION LOGIC ---
// Settings is a screen of its own, so the editor keeps the whole window to itself.
function toggleSettings() {
    pulseButton('settings-btn');
    const settings = document.getElementById('settings-screen');
    const showing = settings.style.display === 'none';

    settings.style.display = showing ? '' : 'none';
    document.getElementById('editor-screen').style.display = showing ? 'none' : '';
    document.getElementById('settings-btn-label').innerText = showing ? 'Back to Editor' : 'Settings';
    if (!showing) fitKeyboard();   // the editor was hidden, so it could not be measured
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function driverSetup() {
    pulseButton('btn-driver-setup');
    window.electronAPI.driverSetup();
}

// --- PAIRED MACROPADS ---
const LAYOUTS = { full: 'Full keyboard', numpad: 'Numpad', tkl: 'Tenkeyless' };

function renderDevices(devices) {
    pairedMacropads = devices;
    renderList();   // device badges on the macro list depend on this

    const host = document.getElementById('device-list');
    if (!host) return;

    if (!devices.length) {
        host.innerHTML = '<p style="color:#888; font-size:0.85em; margin:0;">No macropads paired yet.</p>';
        return;
    }

    // Hardware ids and user-typed names both go into markup here, so escape them.
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    host.innerHTML = devices.map((d) => {
        const opts = Object.entries(LAYOUTS)
            .map(([v, label]) => `<option value="${v}"${d.layout === v ? ' selected' : ''}>${label}</option>`)
            .join('');
        return `<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;"
                     data-hwid="${esc(d.hwid)}">
            <input type="text" data-act="rename" value="${esc(d.name)}" style="flex:1; margin:0;">
            <select data-act="layout" style="width:auto; margin:0;">${opts}</select>
            <button data-act="forget" title="Forget this macropad"
                    style="margin:0; background:#cc3300;">✕</button>
        </div>
        <p style="color:#666; font-size:0.72em; margin:0 0 10px 0; word-break:break-all;">${esc(d.hwid)}</p>`;
    }).join('');
}

// Delegated, not inline onclick: script.js is a classic script, so only function
// declarations land on window and an inline handler calling anything else silently throws.
function deviceRowAction(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const hwid = el.closest('[data-hwid]').dataset.hwid;

    if (el.dataset.act === 'rename') window.electronAPI.updateDevice({ hwid, name: el.value });
    if (el.dataset.act === 'layout') {
        window.electronAPI.updateDevice({ hwid, layout: el.value });
        showToast(`Overlay set to ${LAYOUTS[el.value]}`);
    }
    if (el.dataset.act === 'forget') forgetDevice(hwid);
}

const deviceListEl = document.getElementById('device-list');
if (deviceListEl) {
    deviceListEl.addEventListener('change', deviceRowAction);
    deviceListEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="forget"]')) deviceRowAction(e);
    });
}

function pairDevice() {
    pulseButton('btn-pair-device');
    window.electronAPI.pairDevice();
    showToast("Press any key on the macropad you want to add!");
}

function forgetDevice(hwid) {
    showCustomAlert(
        "Forget this Macropad?",
        "Its keys go back to typing normally. Macros bound to it are kept, but will not fire until you pair it again.",
        "Forget", "#cc3300",
        () => { window.electronAPI.removeDevice(hwid); showToast("Macropad forgotten."); }
    );
}

window.electronAPI.onDevicesChanged((event, devices) => renderDevices(devices));

// --- RESET DEVICE LOGIC ---
function resetDevice() {
    showCustomAlert(
        "Reset Device Connection?", 
        "This will forget your currently paired Macropad. The next key you press on any keyboard will pair that device instead. Are you sure?",
        "Reset Connection",
        "#cc3300",
        () => {
            // Tell the backend to drop the saved id and go back to learning mode
            window.electronAPI.resetHardwareId();
            showToast("Device connection reset!");
            
            // Auto-close the settings drawer for a clean UI reset
            toggleSettings();
            
            // Reset the status bar to show it is listening again
            const statusBar = document.getElementById('status-bar');
            const statusText = document.getElementById('status-text');
            statusBar.classList.remove('connected');
            statusText.innerText = "Status: Waiting for new device...";
            statusText.style.color = "#aaa";
        }
    );
}

function toggleActionInput() {
    document.getElementById('shortcut-input').value = '';
    document.getElementById('shortcut-input').dataset.ahk = '';
    document.getElementById('path-input').value = '';
    document.getElementById('custom-input').value = '';
    document.getElementById('input-send').style.display = 'none';
    document.getElementById('input-run').style.display = 'none';
    document.getElementById('input-custom').style.display = 'none';
    document.getElementById('input-clock').style.display = 'none';
    const actionType = document.getElementById('action-type').value;
    if (actionType === 'send') document.getElementById('input-send').style.display = 'block';
    if (actionType === 'run') document.getElementById('input-run').style.display = 'block';
    if (actionType === 'clock') document.getElementById('input-clock').style.display = 'block';

    // js and custom share the same textarea - only the label and hint differ
    if (actionType === 'custom' || actionType === 'js') {
        const isJs = actionType === 'js';
        document.getElementById('input-custom').style.display = 'block';
        document.getElementById('custom-label').innerText = isJs ? '3. Write your JavaScript' : '3. Paste your AHK v2 Code';
        document.getElementById('custom-input').placeholder = isJs
            ? "send('^c');\nawait sleep(100);\ntype('hello');"
            : 'Paste your raw code here...';
        document.getElementById('js-help').style.display = isJs ? 'block' : 'none';
    }
}

function toggleKeyManualMode() {
    const input = document.getElementById('keyId');
    if (document.getElementById('key-manual-toggle').checked) {
        input.removeAttribute('readonly');
        input.placeholder = "Type raw virtual-key code (e.g., 65)";
    } else {
        input.setAttribute('readonly', 'true');
        input.placeholder = "Click here, then press a key...";
    }
    input.value = "";
}

function toggleManualMode() {
    const input = document.getElementById('shortcut-input');
    if (document.getElementById('manual-toggle').checked) {
        input.removeAttribute('readonly');
        input.placeholder = "Type AHK code directly (e.g., #d for Win+D)";
    } else {
        input.setAttribute('readonly', 'true');
        input.placeholder = "Click here, then press your shortcut...";
    }
    input.value = "";
}

document.getElementById('keyId').addEventListener('keydown', function(e) {
    if (document.getElementById('key-manual-toggle').checked) return; 
    e.preventDefault(); 
    let keyName = e.key.toUpperCase();
    if (e.location === 3) {
        if (e.key >= '0' && e.key <= '9') keyName = "NUM" + e.key;
        else if (e.key === '*') keyName = "NUM*";
        else if (e.key === '+') keyName = "NUM+";
        else if (e.key === '-') keyName = "NUM-";
        else if (e.key === '.') keyName = "NUM.";
        else if (e.key === '/') keyName = "NUM/";
    }
    if (keyName === " ") keyName = "SPACE";
    if (keyName === "ESCAPE") keyName = "ESC";
    if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(keyName)) return;
    this.value = keyName; 
});

// --- BIND BY PRESSING THE MACROPAD KEY ---
// The macropad is captured by the driver, so its keys never reach the DOM. The engine
// forwards the next press instead, which also tells us which board it came from.
const vkToName = Object.fromEntries(Object.entries(keyDictionary).map(([name, vk]) => [vk, name]));

document.getElementById('keyId').addEventListener('focus', function () {
    if (document.getElementById('key-manual-toggle').checked) return;
    window.electronAPI.captureKey();
    this.placeholder = "Press a key on your macropad...";
});

document.getElementById('keyId').addEventListener('blur', function () {
    window.electronAPI.cancelCapture();
    if (!document.getElementById('key-manual-toggle').checked) {
        this.placeholder = "Click here, then press a key...";
    }
});

window.electronAPI.onKeyCaptured((event, { keyId, hwid, deviceName }) => {
    const input = document.getElementById('keyId');
    input.dataset.keyid = keyId;
    input.dataset.device = hwid;
    input.value = vkToName[keyId] || ("ID:" + keyId);
    showToast(`Bound to ${input.value} on ${deviceName}`);
});

document.getElementById('shortcut-input').addEventListener('keydown', function(e) {
    if (document.getElementById('manual-toggle').checked) return; 
    e.preventDefault(); 
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    let visualModifiers = []; 
    let ahkModifiers = "";    
    if (e.ctrlKey) { visualModifiers.push("Ctrl"); ahkModifiers += "^"; }
    if (e.shiftKey) { visualModifiers.push("Shift"); ahkModifiers += "+"; }
    if (e.altKey) { visualModifiers.push("Alt"); ahkModifiers += "!"; }
    if (e.metaKey) { visualModifiers.push("Win"); ahkModifiers += "#"; } 
    let mainKey = e.key;
    if (mainKey === " ") mainKey = "Space";
    let visualText = visualModifiers.length > 0 ? visualModifiers.join(" + ") + " + " + mainKey.toUpperCase() : mainKey.toUpperCase();
    this.value = visualText;
    let ahkKey = mainKey.length === 1 ? mainKey.toLowerCase() : `{${mainKey}}`;
    this.dataset.ahk = ahkModifiers + ahkKey; 
});

function createNewProfile() {
    pulseButton('new-profile-btn');
    showCustomPrompt("New Profile Name", "e.g., Premiere Pro...", (name) => {
        if (name && !appData.profiles[name]) {
            appData.profiles[name] = [];
            appData.activeProfile = name;
            updateProfileDropdown();
            renderList();
            window.electronAPI.saveMacros(appData); 
            showToast(`Created profile: ${name}`);
        } else if (appData.profiles[name]) {
            showToast("A profile with that name already exists!", true);
        }
    });
}

function switchProfile() {
    resetForm(); 
    appData.activeProfile = document.getElementById('profile-select').value;
    renderList();

    // --- NEW: Check the box ONLY if this profile is the designated Startup Profile ---
    document.getElementById('auto-apply-toggle').checked = (appData.settings.autoApply === appData.activeProfile);

    window.electronAPI.saveMacros(appData); 
    showToast(`Switched to ${appData.activeProfile}.`);
}

// --- NEW: Profile Deletion Logic ---
function deleteCurrentProfile() {
    pulseButton('delete-profile-btn');
    const current = appData.activeProfile;

    if (current === "Default") {
        // Behavior 1: Wipe the Default profile
        showCustomAlert(
            "Clear Default Profile?", 
            "The Default profile cannot be deleted, but you can clear all its saved macros. Are you sure?", 
            "Clear Profile", 
            "#cc3300", 
            () => {
                appData.profiles["Default"] = [];
                renderList();
                window.electronAPI.saveMacros(appData);
                showToast("Default profile cleared!");
            }
        );
    } else {
        // Behavior 2: Permanently delete custom profiles
        showCustomAlert(
            "Delete Profile?", 
            `Are you sure you want to permanently delete the '${current}' profile and all its macros?`, 
            "Delete Profile", 
            "#cc3300", 
            () => {
                // 1. Delete the data
                delete appData.profiles[current];
                
                // 2. Safety check: If they deleted their startup profile, turn off auto-run
                if (appData.settings.autoApply === current) {
                    appData.settings.autoApply = false;
                    document.getElementById('auto-apply-toggle').checked = false;
                }
                
                // 3. Kick them back to the Default profile safely
                appData.activeProfile = "Default";
                updateProfileDropdown();
                renderList();
                window.electronAPI.saveMacros(appData);
                showToast(`Profile '${current}' deleted.`);
            }
        );
    }
}

function updateProfileDropdown() {
    const select = document.getElementById('profile-select');
    select.innerHTML = '';
    for (const profileName in appData.profiles) {
        const option = document.createElement('option');
        option.value = profileName;
        option.innerText = profileName;
        if (profileName === appData.activeProfile) option.selected = true;
        select.appendChild(option);
    }
}

function renderList(animatedKeyId = null) {
    const ul = document.getElementById('macro-list');
    ul.innerHTML = '';
    let currentMacros = appData.profiles[appData.activeProfile] || [];

    // The grid answers "what is on this key?"; the search answers "where did I put
    // that Discord mute?". Match on everything the row actually shows.
    const query = (document.getElementById('macro-search').value || '').trim().toLowerCase();
    if (query) {
        currentMacros = currentMacros.filter(m =>
            [m.visualKey, m.desc, m.visualValue, m.value]
                .some(f => f && String(f).toLowerCase().includes(query)));
    }
    document.getElementById('search-empty').style.display =
        query && !currentMacros.length ? '' : 'none';

    currentMacros.forEach(macro => {
        const li = document.createElement('li');
        li.className = 'macro-item';
        if (macro.keyId == animatedKeyId) li.classList.add('new-entry');
        
        let displayText = `<div style="display: flex; align-items: center; gap: 10px;">`;
        displayText += `<span style="font-weight: bold; color: #007acc; font-size: 0.9em; min-width: 75px;">KEY [${macro.visualKey}]</span>`;
        // Only worth naming the board once more than one is paired
        if (macro.device && pairedMacropads.length > 1) {
            const dev = pairedMacropads.find(d => d.hwid === macro.device);
            displayText += `<span style="font-size:0.72em; color:#aaa; background:#333; padding:2px 7px; border-radius:9px; white-space:nowrap;">${dev ? dev.name : 'unpaired device'}</span>`;
        }
        if (macro.desc) {
            displayText += `<span>${macro.desc}</span>`;
        } else {
            displayText += `<span>${macro.type === 'send' ? `Presses '${macro.visualValue}'` : macro.type === 'clock' ? `Shows ${macro.visualValue}` : `Runs '${macro.visualValue}'`}</span>`;
        }
        displayText += `</div>`;

        li.innerHTML = `
            <span data-keyid="${macro.keyId}" 
                    data-visualkey="${macro.visualKey}" 
                    data-type="${macro.type}" 
                    data-value="${encodeURIComponent(macro.value)}"
                    data-visualvalue="${macro.visualValue}"
                    data-desc="${macro.desc || ""}"
                    data-iskeymanual="${macro.isKeyManual || false}"
                    data-isshortcutmanual="${macro.isShortcutManual || false}"
                    data-device="${macro.device || ""}">
                ${displayText}
            </span>
            <div class="btn-group">
                <button class="edit-btn" onclick="editMacro(this)">Edit</button>
                <button class="delete-btn" onclick="deleteMacro(this)">Remove</button>
            </div>
        `;
        ul.appendChild(li);
    });

    renderGrid();   // the same macros, drawn on the keyboard
}

// --- KEYBOARD GRID VIEW ---
// A macropad is a physical object, so the primary way to find a macro is to point at
// the key it lives on. The list is still there behind the toggle for searching by eye.
let gridDevice = 0;             // index into pairedMacropads
let gridShown = new Map();      // keyId -> the macro actually drawn on it

function renderGrid() {
    const board = document.getElementById('grid-keyboard');
    if (!board) return;
    if (!board.querySelector('.key')) board.innerHTML = keyboardMarkup();

    if (gridDevice >= pairedMacropads.length) gridDevice = 0;
    renderDeviceTabs(document.getElementById('grid-device-tabs'), pairedMacropads, gridDevice);

    const macros = appData.profiles[appData.activeProfile] || [];
    gridShown = paintKeyboard(board, macros, pairedMacropads[gridDevice], 'Click to assign');

    board.querySelectorAll('.key.editing').forEach(k => k.classList.remove('editing'));
    if (editingKeyId !== null) {
        board.querySelectorAll(`.key[data-id="${editingKeyId}"]`).forEach(k => k.classList.add('editing'));
    }

    fitKeyboard();   // layouts differ in width, so refit whenever the board changes
}

// Shrink the board until it fits its column. A full keyboard is about 900px wide
// and the column is narrower than that, and the numpad layout already fits, so
// this is a no-op for most macropads.
function fitKeyboard() {
    const board = document.getElementById('grid-keyboard');
    if (!board) return;

    // Measure the keys themselves, not the container: a hidden block contributes no
    // width, and a key that overflows its cluster contributes width the container
    // never reports. The visible keys are what actually has to fit.
    const extent = () => {
        const rects = [...board.querySelectorAll('.key')]
            .filter(k => k.offsetParent)
            .map(k => k.getBoundingClientRect());
        if (!rects.length) return 0;
        return Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left));
    };

    board.style.zoom = '';                      // measure at natural size
    // A pixel of slack: zoom lands on fractional widths, and rounding up would put
    // the rightmost key a hair past the edge.
    const available = board.parentElement.clientWidth - 1;
    const natural = extent();
    if (!available || !natural || natural <= available) return;

    // A floor keeps the labels legible; below it the board is left to overflow.
    const floor = 0.5;
    board.style.zoom = Math.max(available / natural, floor);

    // zoom re-resolves the max-content width, so the first ratio lands a little
    // wide. One correction against the measured result settles it exactly.
    const after = extent();
    if (after > available) {
        board.style.zoom = Math.max(board.style.zoom * available / after, floor);
    }
}

window.addEventListener('resize', fitKeyboard);

function setMacroView(view) {
    const grid = view === 'grid';
    document.getElementById('grid-view').style.display = grid ? '' : 'none';
    document.getElementById('list-view').style.display = grid ? 'none' : '';
    document.getElementById('view-grid-btn').classList.toggle('selected', grid);
    document.getElementById('view-list-btn').classList.toggle('selected', !grid);
    if (grid) fitKeyboard();   // it could not be measured while it was hidden
}

document.getElementById('grid-device-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.device-tab');
    if (!tab) return;
    gridDevice = Number(tab.dataset.index);
    renderGrid();
});

document.getElementById('grid-keyboard').addEventListener('click', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    const keyId = key.dataset.id;

    const macro = gridShown.get(keyId);
    if (macro) { loadMacroIntoEditor(macro); return; }

    // Free key: set the editor up for a new macro on it, so the user never has to
    // press the physical key just to say which one they meant.
    resetForm();
    const keyField = document.getElementById('keyId');
    keyField.value = vkToName[keyId] || ("ID:" + keyId);
    keyField.dataset.keyid = keyId;
    const device = pairedMacropads[gridDevice];
    if (device) keyField.dataset.device = device.hwid; else delete keyField.dataset.device;
    document.getElementById('shortcut-input').focus();
    renderGrid();
});

function resetForm(delayButtonReset = false) {
    const keyField = document.getElementById('keyId');
    keyField.value = '';
    delete keyField.dataset.keyid;
    delete keyField.dataset.device;
    document.getElementById('shortcut-input').value = '';
    document.getElementById('path-input').value = '';
    document.getElementById('custom-input').value = '';
    document.getElementById('desc-input').value = ''; 
    document.getElementById('action-type').value = 'send';
    toggleActionInput();
    editingKeyId = null;
    renderGrid();   // drop the "editing" highlight

    const restoreButton = () => {
        const addBtn = document.getElementById('add-btn');
        addBtn.innerHTML = `<span id="add-icon" style="display: inline-block;"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg></span> Add to List`;
        addBtn.style.background = "#007acc";
        addBtn.style.color = "white";
        document.getElementById('cancel-btn').style.display = 'none';
    };

    if (delayButtonReset) {
        setTimeout(restoreButton, 400);
    } else {
        restoreButton();
    }
}

function saveMacroToMemory(newMacro, existingIndex, friendlyKeyName) {
    if (editingKeyId) {
        if (editingKeyId == newMacro.keyId) {
            appData.profiles[appData.activeProfile][existingIndex] = newMacro;
            showToast("Macro updated!");
        } else {
            if (existingIndex !== -1) appData.profiles[appData.activeProfile].splice(existingIndex, 1);
            appData.profiles[appData.activeProfile] = appData.profiles[appData.activeProfile].filter(m => m.keyId != editingKeyId);
            appData.profiles[appData.activeProfile].push(newMacro);
            showToast("Macro moved and updated!");
        }
    } else {
        if (existingIndex !== -1) {
            appData.profiles[appData.activeProfile][existingIndex] = newMacro;
            showToast("Macro overwritten!");
        } else {
            appData.profiles[appData.activeProfile].push(newMacro);
            showToast("Macro added!");
        }
    }
    renderList(newMacro.keyId);
    resetForm(true);

    setTimeout(() => {
        const list = document.getElementById('macro-list');
        const animatedItem = list.querySelector('.new-entry');
        if (animatedItem) animatedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
}

function addMacroToList() {
    const addBtn = document.getElementById('add-btn');
    const addIcon = document.getElementById('add-icon');
    addBtn.classList.remove('btn-add-pulse');
    if (addIcon) addIcon.classList.remove('icon-spin');
    void addBtn.offsetWidth; 
    addBtn.classList.add('btn-add-pulse');
    if (addIcon) addIcon.classList.add('icon-spin');
    
    let rawKeyInput = document.getElementById('keyId').value;
    const isKeyManual = document.getElementById('key-manual-toggle').checked;
    let finalKeyId = "";
    let friendlyKeyName = "";

    const keyInput = document.getElementById('keyId');
    if (isKeyManual) {
        finalKeyId = rawKeyInput;
        friendlyKeyName = "ID:" + rawKeyInput;
    } else if (keyInput.dataset.keyid) {
        // Captured straight off the macropad, so the code is already exact
        finalKeyId = keyInput.dataset.keyid;
        friendlyKeyName = rawKeyInput.toUpperCase();
    } else {
        friendlyKeyName = rawKeyInput.toUpperCase();
        finalKeyId = keyDictionary[friendlyKeyName] || friendlyKeyName;
    }
    const boundDevice = isKeyManual ? '' : (keyInput.dataset.device || '');

    const actionType = document.getElementById('action-type').value;
    let actionValue = "";
    let visualActionValue = ""; 
    const isShortcutManual = document.getElementById('manual-toggle').checked;
    
    if (actionType === 'send') {
        actionValue = isShortcutManual ? document.getElementById('shortcut-input').value : document.getElementById('shortcut-input').dataset.ahk; 
        visualActionValue = document.getElementById('shortcut-input').value;
    } else if (actionType === 'run') {
        actionValue = document.getElementById('path-input').value;
        visualActionValue = actionValue;
    } else if (actionType === 'custom') {
        actionValue = document.getElementById('custom-input').value;
        visualActionValue = "Custom AHK Script";
    } else if (actionType === 'js') {
        actionValue = document.getElementById('custom-input').value;
        visualActionValue = "JavaScript";
    } else if (actionType === 'clock') {
        const fmt = document.getElementById('clock-format');
        actionValue = fmt.value; // {datetime} | {time} | {date}
        visualActionValue = fmt.options[fmt.selectedIndex].text; // e.g. "Date & Time"
    }

    const description = document.getElementById('desc-input').value;
    
    if (!rawKeyInput || !actionValue) {
        showToast("Please fill out the required fields!", true);
        return;
    }

    const newMacro = {
        keyId: finalKeyId, visualKey: friendlyKeyName, type: actionType,
        value: actionValue, visualValue: visualActionValue, desc: description,
        isKeyManual: isKeyManual, isShortcutManual: isShortcutManual,
        device: boundDevice   // '' means any paired macropad
    };

    // Same key on a different macropad is a different macro, so match on both
    const existingIndex = appData.profiles[appData.activeProfile]
        .findIndex(m => m.keyId == finalKeyId && (m.device || '') === boundDevice);

    if (existingIndex !== -1 && editingKeyId != finalKeyId) {
        showCustomAlert("Overwrite Key?", `Key [${friendlyKeyName}] is already assigned. Do you want to overwrite it?`, "Overwrite", "#d4a373", () => saveMacroToMemory(newMacro, existingIndex, friendlyKeyName));
    } else {
        saveMacroToMemory(newMacro, existingIndex, friendlyKeyName);
    }
}

function editMacro(button) {
    const span = button.parentElement.parentElement.querySelector('span');
    const macro = (appData.profiles[appData.activeProfile] || []).find(m =>
        m.keyId == span.getAttribute('data-keyid') &&
        (m.device || '') === (span.getAttribute('data-device') || ''));
    if (macro) loadMacroIntoEditor(macro);
}

// Both the list rows and the keyboard grid open a macro through here, so there is
// one definition of "what the editor looks like with this macro in it".
function loadMacroIntoEditor(macro) {
    const isKeyManual = macro.isKeyManual === true || macro.isKeyManual === 'true';
    document.getElementById('key-manual-toggle').checked = isKeyManual;
    toggleKeyManualMode();

    const isShortcutManual = macro.isShortcutManual === true || macro.isShortcutManual === 'true';
    document.getElementById('manual-toggle').checked = isShortcutManual;
    toggleManualMode();

    const keyField = document.getElementById('keyId');
    keyField.value = String(macro.visualKey).replace("ID:", "");
    keyField.dataset.keyid = macro.keyId;
    if (macro.device) keyField.dataset.device = macro.device; else delete keyField.dataset.device;

    // A legacy AHK macro (from an .mps exported before the engine swap) opens in the
    // JavaScript editor with its old code visible, so it can be rewritten in place.
    document.getElementById('action-type').value = macro.type === 'custom' ? 'js' : macro.type;
    toggleActionInput();
    if (macro.type === 'custom') showToast("This was an AutoHotkey macro - rewrite it as JavaScript.", true);

    if (macro.type === 'send') {
        document.getElementById('shortcut-input').value = macro.visualValue;
        if (!isShortcutManual) document.getElementById('shortcut-input').dataset.ahk = macro.value;
    } else if (macro.type === 'run') {
        document.getElementById('path-input').value = macro.value;
    } else if (macro.type === 'custom' || macro.type === 'js') {
        document.getElementById('custom-input').value = macro.value;
    } else if (macro.type === 'clock') {
        document.getElementById('clock-format').value = macro.value;
    }
    document.getElementById('desc-input').value = macro.desc || "";

    editingKeyId = macro.keyId;
    renderGrid();   // move the "editing" highlight onto this key
    const addBtn = document.getElementById('add-btn');
    addBtn.innerHTML = `<span id="add-icon" style="display: inline-block;"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg></span> Update Macro`;
    addBtn.style.background = "#d4a373";
    addBtn.style.color = "#1e1e1e";
    
    document.getElementById('cancel-btn').style.display = 'block'; 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function deleteMacro(button) {
    const li = button.parentElement.parentElement;
    const span = li.querySelector('span');
    const keyIdToRemove = span.getAttribute('data-keyid');
    const deviceToRemove = span.getAttribute('data-device') || '';
    const visualKey = span.getAttribute('data-visualkey');

    showCustomAlert(
        "Delete Macro?", 
        `Are you sure you want to remove the macro for [${visualKey}]?`, 
        "Yes, Delete", 
        "#cc3300", 
        () => {
            li.classList.add('removing');
            setTimeout(() => {
                // The same key can exist on more than one macropad, so match the device too
                appData.profiles[appData.activeProfile] = appData.profiles[appData.activeProfile]
                    .filter(m => !(m.keyId == keyIdToRemove && (m.device || '') === deviceToRemove));
                if (editingKeyId == keyIdToRemove) resetForm();
                renderList();
            }, 300);
        }
    );
}

async function exportProfile() {
    pulseButton('export-btn');
    const currentMacros = appData.profiles[appData.activeProfile] || [];
    if (currentMacros.length === 0) {
        showToast("Cannot export an empty profile!", true);
        return;
    }
    const success = await window.electronAPI.exportProfile(currentMacros);
    if (success) showToast("Profile exported successfully!");
}

async function importProfile() {
    pulseButton('import-btn');
    const importedMacros = await window.electronAPI.importProfile();
    if (importedMacros) {
        if (importedMacros.error) {
            showToast(importedMacros.error, true);
            return;
        }
        showCustomAlert(
            "Import Profile?", 
            `Found ${importedMacros.length} macros. Do you want to merge them into your current profile ('${appData.activeProfile}')? Existing keys will be overwritten.`, 
            "Merge Macros", 
            "#007acc", 
            () => {
                importedMacros.forEach(newMacro => {
                    const existingIndex = appData.profiles[appData.activeProfile].findIndex(m => m.keyId === newMacro.keyId);
                    if (existingIndex !== -1) {
                        appData.profiles[appData.activeProfile][existingIndex] = newMacro;
                    } else {
                        appData.profiles[appData.activeProfile].push(newMacro);
                    }
                });
                renderList();
                window.electronAPI.saveMacros(appData); 
                showToast("Profile merged successfully!");
            }
        );
    }
}

function saveAndApply() {
    window.electronAPI.saveMacros(appData);
    showToast("Saved! Your macropad is ready.");
    const btn = document.getElementById('save-apply-btn');
    const rocket = document.getElementById('rocket-icon');
    btn.classList.remove('btn-success-pulse');
    rocket.classList.remove('rocket-fly'); 
    void btn.offsetWidth; 
    btn.classList.add('btn-success-pulse');
    rocket.classList.add('rocket-fly'); 
}

function pulseButton(buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.classList.remove('btn-pulse');
    void btn.offsetWidth; 
    btn.classList.add('btn-pulse');
}

function toggleStartMinimized() {
    if (!appData.settings) appData.settings = {}; 
    appData.settings.startMinimized = document.getElementById('start-minimized-toggle').checked;
    window.electronAPI.saveMacros(appData); 
}

// Inside your DOMContentLoaded block:
document.getElementById('start-minimized-toggle').checked = appData.settings.startMinimized || false;

window.addEventListener('DOMContentLoaded', async () => {
    appData = await window.electronAPI.loadMacros();
    if (!appData.settings) appData.settings = { autoApply: false, showOSD: false };
    
    // --- THE STARTUP LOGIC ---
    // 1. If an autoApply profile exists, forcefully make it the active profile!
    if (appData.settings.autoApply && appData.profiles[appData.settings.autoApply]) {
        appData.activeProfile = appData.settings.autoApply;
    }

    // 2. Sync the UI checkboxes
    document.getElementById('auto-apply-toggle').checked = (appData.settings.autoApply === appData.activeProfile);
    document.getElementById('osd-toggle').checked = appData.settings.showOSD || false;
    document.getElementById('toast-color').value = appData.settings.toastColor || '#28a745';
    document.getElementById('minimize-tray-toggle').checked = appData.settings.minimizeToTray || false;
    document.getElementById('start-minimized-toggle').checked = appData.settings.startMinimized || false;
    
    updateProfileDropdown();
    renderList();

    // 3. Re-save if a startup profile was set, so the overlay picks it up
    if (appData.settings.autoApply) {
        window.electronAPI.saveMacros(appData);
    }

    // --- THE AUTO-CONNECT LOGIC ---
    // If we have a valid 8-character ID saved, start the engine immediately!
    // Devices live in settings.devices now; main migrates settings.hardwareId across on boot,
    // so ask main rather than reading the copy the renderer loaded.
    const devices = await window.electronAPI.listDevices();
    renderDevices(devices);

    if (devices.length) {
        window.electronAPI.startEngine();

        // Instantly flip the UI to the "Connected" state!
        const statusBar = document.getElementById('status-bar');
        const statusText = document.getElementById('status-text');
        const btn = document.getElementById('connectBtn');

        statusBar.classList.add('connected');
        statusText.innerText = devices.length > 1
            ? `Status: Active - ${devices.length} macropads`
            : "Status: Active & Listening";
        statusText.style.color = "#28a745";
        btn.style.display = "none"; // Hide the connect button
    }
});

window.electronAPI.onHardwareLocked(() => {
    // The key was pressed and the ID was saved!
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const btn = document.getElementById('connectBtn'); // Grab the button
    
    statusBar.classList.add('connected');
    statusText.innerText = "Status: Active & Listening";
    statusText.style.color = "#28a745";
    btn.style.display = "none"; // Hide the connect button
    
    showToast("Hardware linked! Auto-connect enabled.");
});

window.electronAPI.onHardwareLearning(() => {
    // The engine is running but has no macropad linked yet - same waiting state the
    // Connect button uses, so the UI never claims to be listening when it is not.
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');

    statusBar.classList.remove('connected');
    statusText.innerText = "Status: Waiting for keypress...";
    statusText.style.color = "#d4a373";
    document.getElementById('connectBtn').style.display = "none";

    showToast("Press any key on your Macropad to link it!");
});

window.electronAPI.onLoadExternalProfile((event, importedMacros) => {
    window.focus(); 
    showCustomAlert(
        "External Profile Detected", 
        `You opened an .mps file containing ${importedMacros.length} macros. Do you want to merge them into your current profile ('${appData.activeProfile}')?`, 
        "Import File", 
        "#007acc", 
        () => {
            importedMacros.forEach(newMacro => {
                const existingIndex = appData.profiles[appData.activeProfile].findIndex(m => m.keyId === newMacro.keyId);
                if (existingIndex !== -1) {
                    appData.profiles[appData.activeProfile][existingIndex] = newMacro;
                } else {
                    appData.profiles[appData.activeProfile].push(newMacro);
                }
            });
            renderList();
            window.electronAPI.saveMacros(appData); 
            showToast("External profile imported successfully!");
        }
    );
});

window.electronAPI.onShowCloseModal(() => { 
    // If the user checked the box, bypass the modal and instantly minimize!
    if (appData.settings && appData.settings.minimizeToTray) {
        handleClose('minimize');
    } else {
        // Otherwise, show the prompt as normal
        document.getElementById('close-modal').classList.add('show'); 
    }
});