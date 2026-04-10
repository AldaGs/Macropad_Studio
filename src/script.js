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
    window.electronAPI.startLuaMacros();
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const btn = document.getElementById('connectBtn');
    statusBar.classList.add('connected');
    statusText.innerText = "Status: Active & Listening";
    statusText.style.color = "#28a745";
    btn.style.display = "none";
    showToast("LuaMacros started! Press your macropad key to lock it in.");
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

function toggleActionInput() {
    document.getElementById('shortcut-input').value = '';
    document.getElementById('shortcut-input').dataset.ahk = '';
    document.getElementById('path-input').value = '';
    document.getElementById('custom-input').value = '';
    document.getElementById('input-send').style.display = 'none';
    document.getElementById('input-run').style.display = 'none';
    document.getElementById('input-custom').style.display = 'none';
    const actionType = document.getElementById('action-type').value;
    if (actionType === 'send') document.getElementById('input-send').style.display = 'block';
    if (actionType === 'run') document.getElementById('input-run').style.display = 'block';
    if (actionType === 'custom') document.getElementById('input-custom').style.display = 'block';
}

function toggleKeyManualMode() {
    const input = document.getElementById('keyId');
    if (document.getElementById('key-manual-toggle').checked) {
        input.removeAttribute('readonly');
        input.placeholder = "Type raw LuaMacros ID (e.g., 65)";
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
    const currentMacros = appData.profiles[appData.activeProfile] || [];

    currentMacros.forEach(macro => {
        const li = document.createElement('li');
        li.className = 'macro-item';
        if (macro.keyId == animatedKeyId) li.classList.add('new-entry');
        
        let displayText = `<div style="display: flex; align-items: center; gap: 10px;">`;
        displayText += `<span style="font-weight: bold; color: #007acc; font-size: 0.9em; min-width: 75px;">KEY [${macro.visualKey}]</span>`;
        if (macro.desc) {
            displayText += `<span>${macro.desc}</span>`;
        } else {
            displayText += `<span>${macro.type === 'send' ? `Presses '${macro.visualValue}'` : `Runs '${macro.visualValue}'`}</span>`;
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
                    data-isshortcutmanual="${macro.isShortcutManual || false}">
                ${displayText}
            </span>
            <div class="btn-group">
                <button class="edit-btn" onclick="editMacro(this)">Edit</button>
                <button class="delete-btn" onclick="deleteMacro(this)">Remove</button>
            </div>
        `;
        ul.appendChild(li);
    });
}

function resetForm(delayButtonReset = false) {
    document.getElementById('keyId').value = '';
    document.getElementById('shortcut-input').value = '';
    document.getElementById('path-input').value = '';
    document.getElementById('custom-input').value = '';
    document.getElementById('desc-input').value = ''; 
    document.getElementById('action-type').value = 'send';
    toggleActionInput();
    editingKeyId = null;
    
    const restoreButton = () => {
        const addBtn = document.getElementById('add-btn');
        addBtn.innerHTML = `<span id="add-icon" style="display: inline-block;">➕</span> Add to List`;
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

    if (isKeyManual) {
        finalKeyId = rawKeyInput; 
        friendlyKeyName = "ID:" + rawKeyInput; 
    } else {
        friendlyKeyName = rawKeyInput.toUpperCase(); 
        finalKeyId = keyDictionary[friendlyKeyName] || friendlyKeyName;
    }

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
    }

    const description = document.getElementById('desc-input').value;
    
    if (!rawKeyInput || !actionValue) {
        showToast("Please fill out the required fields!", true);
        return;
    }

    const newMacro = { 
        keyId: finalKeyId, visualKey: friendlyKeyName, type: actionType, 
        value: actionValue, visualValue: visualActionValue, desc: description,
        isKeyManual: isKeyManual, isShortcutManual: isShortcutManual
    };
    
    const existingIndex = appData.profiles[appData.activeProfile].findIndex(m => m.keyId == finalKeyId);

    if (existingIndex !== -1 && editingKeyId != finalKeyId) {
        showCustomAlert("Overwrite Key?", `Key [${friendlyKeyName}] is already assigned. Do you want to overwrite it?`, "Overwrite", "#d4a373", () => saveMacroToMemory(newMacro, existingIndex, friendlyKeyName));
    } else {
        saveMacroToMemory(newMacro, existingIndex, friendlyKeyName);
    }
}

function editMacro(button) {
    const li = button.parentElement.parentElement;
    const span = li.querySelector('span');
    
    const isKeyManual = span.getAttribute('data-iskeymanual') === 'true';
    document.getElementById('key-manual-toggle').checked = isKeyManual;
    toggleKeyManualMode();

    const isShortcutManual = span.getAttribute('data-isshortcutmanual') === 'true';
    document.getElementById('manual-toggle').checked = isShortcutManual;
    toggleManualMode();

    document.getElementById('keyId').value = span.getAttribute('data-visualkey').replace("ID:", "");
    document.getElementById('action-type').value = span.getAttribute('data-type');
    toggleActionInput();
    
    if (span.getAttribute('data-type') === 'send') {
        document.getElementById('shortcut-input').value = span.getAttribute('data-visualvalue');
        if (!isShortcutManual) document.getElementById('shortcut-input').dataset.ahk = decodeURIComponent(span.getAttribute('data-value'));
    } else if (span.getAttribute('data-type') === 'run') {
        document.getElementById('path-input').value = decodeURIComponent(span.getAttribute('data-value'));
    } else if (span.getAttribute('data-type') === 'custom') {
        document.getElementById('custom-input').value = decodeURIComponent(span.getAttribute('data-value'));
    }
    document.getElementById('desc-input').value = span.getAttribute('data-desc') || "";
    
    editingKeyId = span.getAttribute('data-keyid');
    const addBtn = document.getElementById('add-btn');
    addBtn.innerHTML = `<span id="add-icon" style="display: inline-block;">💾</span> Update Macro`;
    addBtn.style.background = "#d4a373";
    addBtn.style.color = "#1e1e1e";
    
    document.getElementById('cancel-btn').style.display = 'block'; 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function deleteMacro(button) {
    const li = button.parentElement.parentElement;
    const span = li.querySelector('span');
    const keyIdToRemove = span.getAttribute('data-keyid');
    const visualKey = span.getAttribute('data-visualkey');

    showCustomAlert(
        "Delete Macro?", 
        `Are you sure you want to remove the macro for [${visualKey}]?`, 
        "Yes, Delete", 
        "#cc3300", 
        () => {
            li.classList.add('removing');
            setTimeout(() => {
                appData.profiles[appData.activeProfile] = appData.profiles[appData.activeProfile].filter(m => m.keyId != keyIdToRemove);
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
    
    updateProfileDropdown();
    renderList();

    // 3. Auto-compile AHK if a startup profile was set
    if (appData.settings.autoApply) {
        window.electronAPI.saveMacros(appData);
    }
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