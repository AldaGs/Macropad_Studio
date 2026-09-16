const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog, Notification } = require('electron'); 
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { Engine } = require('./engine');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // If an instance is already running, quit this new one immediately
    app.quit();
    return;
}

// Global variables
let mainWindow = null;
let tray = null;
let appIsQuitting = false;
let overlayWindow = null;
let toastWindow = null;
let engine = null;
let learningDevice = false; // true while waiting for the user to press a key on their macropad

const profilesPath = () => path.join(app.getPath('userData'), 'profiles.json');

function readProfiles() {
    try {
        if (fs.existsSync(profilesPath())) return JSON.parse(fs.readFileSync(profilesPath(), 'utf-8'));
    } catch (e) { console.error("Could not read profiles.json", e); }
    return { activeProfile: "Default", profiles: { "Default": [] }, settings: {} };
}

function writeProfiles(data) {
    fs.writeFileSync(profilesPath(), JSON.stringify(data, null, 2), 'utf-8');
}

// Interception reports a full Windows hardware id ("HID\VID_046D&..."). LuaMacros stored an
// 8-character fragment, so anything not in the new shape means this profile predates the
// engine swap and the user has to press a key once to re-link their macropad.
const isUsableHwid = (id) => typeof id === 'string' && id.toUpperCase().startsWith('HID\\');

// settings.hardwareId held one device. settings.devices holds several, each with the
// overlay layout it should draw. Returns true if the data changed and needs writing.
function migrateDevices(data) {
    if (!data.settings) data.settings = {};
    const s = data.settings;
    if (Array.isArray(s.devices)) return false;

    s.devices = isUsableHwid(s.hardwareId)
        ? [{ hwid: s.hardwareId, name: 'Macropad 1', layout: 'full' }]
        : [];
    delete s.hardwareId;
    return true;
}

const pairedDevices = () => (readProfiles().settings || {}).devices || [];

// The overlay draws one macropad at a time, so it needs the device list as well as
// the macros - the layout and the tab names come from it.
function pushOverlay(data) {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const state = data || readProfiles();
    overlayWindow.webContents.send('update-overlay', {
        macros: (state.profiles && state.profiles[state.activeProfile]) || [],
        devices: (state.settings && state.settings.devices) || [],
    });
}

// Adds a macropad to the paired list and starts capturing it immediately.
function pairDevice(hwid) {
    const data = readProfiles();
    migrateDevices(data);
    if (data.settings.devices.some((d) => d.hwid === hwid)) {
        learningDevice = false;
        return;
    }

    data.settings.devices.push({
        hwid,
        name: `Macropad ${data.settings.devices.length + 1}`,
        layout: 'full',
    });
    writeProfiles(data);

    learningDevice = false;
    if (engine) engine.syncTargets();
    if (mainWindow) {
        mainWindow.webContents.send('hardware-locked');
        mainWindow.webContents.send('devices-changed', data.settings.devices);
    }
    pushOverlay(data);
}

// --- DRIVER SETUP ---
// Interception is a kernel filter driver: it needs an elevated install and a reboot before
// Macropad Studio can capture anything. Silent installation from inside our own installer is
// a commercial-licence feature of Interception, so this is a guided, consented flow instead.
const installerPath = () => {
    const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
    return path.join(baseDir, 'bin/Interception/install-interception.exe');
};

// Runs the driver installer elevated, then offers the reboot it requires either way.
function runInstaller(flag) {
    const installer = installerPath();
    if (!fs.existsSync(installer)) {
        dialog.showErrorBox('Macropad Studio', `Driver installer is missing:\n${installer}`);
        return;
    }

    // The installer is manifested requireAdministrator, so CreateProcess refuses it outright.
    // ShellExecute with RunAs is what raises the UAC prompt.
    const ps = `Start-Process -FilePath '${installer.replace(/'/g, "''")}' -ArgumentList '${flag}' -Verb RunAs -Wait`;
    exec(`powershell -NoProfile -Command "${ps}"`, (err) => {
        if (err) {
            // Most often the user dismissed the UAC prompt.
            dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                title: 'Macropad Studio',
                message: 'Driver installation did not complete.',
                detail: 'Administrator rights are required. You can try again from Settings.',
            });
            return;
        }

        const verb = flag === '/install' ? 'installed' : 'removed';
        const restart = dialog.showMessageBoxSync(mainWindow, {
            type: 'question',
            title: 'Macropad Studio',
            message: `Driver ${verb}. Windows needs to restart.`,
            detail: `The change only takes effect after a reboot. Restart now?`,
            buttons: ['Restart Now', 'Later'],
            defaultId: 1,
            cancelId: 1,
        });
        if (restart === 0) exec('shutdown /r /t 0');
    });
}

// Opened from Settings, where the driver is usually already working.
function showDriverManage() {
    const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        title: 'Macropad Studio - Interception Driver',
        message: 'Interception driver',
        detail: 'This is the kernel driver that lets Macropad Studio capture one keyboard '
            + 'without its keys reaching the rest of Windows.\n\nReinstall if capture has '
            + 'stopped working. Removing it disables Macropad Studio until you install it again.\n\n'
            + 'Both actions need administrator rights and a restart.',
        buttons: ['Reinstall', 'Uninstall', 'Close'],
        defaultId: 2,
        cancelId: 2,
    });
    if (choice === 0) runInstaller('/install');
    if (choice === 1) runInstaller('/uninstall');
}

function showDriverSetup(detail) {
    const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'info',
        title: 'Macropad Studio - Driver Setup',
        message: 'Macropad Studio needs the Interception driver',
        detail: 'It is what lets the app capture one keyboard without the keys reaching '
            + 'the rest of Windows.\n\nInstalling asks for administrator rights and needs a '
            + 'restart afterwards. You can uninstall it any time from Settings.\n\n' + detail,
        buttons: ['Install Driver', 'What is this?', 'Not Now'],
        defaultId: 0,
        cancelId: 2,
    });

    if (response === 1) {
        shell.openExternal('https://github.com/oblitum/Interception');
        return;
    }
    if (response === 0) runInstaller('/install');
}

function showToast(text, color) {
    if (!toastWindow || toastWindow.isDestroyed()) return;
    toastWindow.showInactive();
    toastWindow.webContents.send('toast', { text, color });
}

// --- THE CUSTOM MENU ---
const menuTemplate = [
    { role: 'fileMenu' },
    { role: 'editMenu' }, 
    {
      role: 'help',
      submenu: [
        {
          label: 'AutoHotkey v2 Key List Reference',
          click: async () => {
            await shell.openExternal('https://www.autohotkey.com/docs/v2/KeyList.htm');
          }
        }
      ]
    }
];
const customMenu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(customMenu);

// --- WINDOW CREATION ---
function createWindow () {

// 1. Read the settings file BEFORE building the window
  const jsonFilePath = path.join(app.getPath('userData'), 'profiles.json');
  let startHidden = false; // Default to showing the app normally
  
  if (fs.existsSync(jsonFilePath)) {
      try {
          const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
          if (data.settings && data.settings.startMinimized) {
              startHidden = true; // The user checked the box!
          }
      } catch(e) { console.error("Error reading startup settings", e); }
  }
  try {
    // --- NEW: THE NATIVE NOTIFICATION ---
    if (startHidden && Notification.isSupported()) {
        new Notification({
            title: 'Macropad Studio',
            body: 'Started in the system tray. Happy Macros!',
            icon: path.join(__dirname, 'assets/icon.ico')
        }).show();
    }
  } catch(e) { console.error("Error sending Notification", e); }

  mainWindow = new BrowserWindow({
    width: 1250,
    height: 980,
    title: "Macropad Studio",
    icon: path.join(__dirname, 'assets/icon.ico'),
    show: !startHidden, // THE FIX: Only show the window if startHidden is false
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true, 
      preload: path.join(__dirname, 'preload.js') 
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!appIsQuitting) {
        event.preventDefault(); 
        mainWindow.webContents.send('show-close-modal'); 
    }
  });

  // THE FIX: Overlay window is now securely INSIDE the createWindow function!
  overlayWindow = new BrowserWindow({
    width: 1160,
    height: 450,
    transparent: true, 
    frame: false,      
    alwaysOnTop: true, 
    skipTaskbar: true, 
    show: false,       
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(false, { forward: false });

  // --- OSD toast. Replaces the AHK Gui that used to be generated into macros.ahk. ---
  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  toastWindow = new BrowserWindow({
    width: 900,
    height: 90,
    x: Math.round((width - 900) / 2),
    y: height - 120,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  toastWindow.loadFile(path.join(__dirname, 'toast.html'));
  toastWindow.setIgnoreMouseEvents(true, { forward: true });
}

// --- THE MACRO ENGINE ---
// Interception grabs the macropad below the OS keyboard stack, so nothing leaks to the
// foreground app and no external LuaMacros/AutoHotkey process is needed to listen.
function startEngine() {
    const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');

    // Any legacy LuaMacros instance must go, or both engines fire on every press.
    exec('taskkill /f /im LuaMacros.exe', () => {});

    if (engine) engine.stop();

    engine = new Engine({
        dllPath: path.join(baseDir, 'bin/Interception/interception.dll'),
        getState: readProfiles,
        showToast,
        // Fallback for run targets that are not executables. URLs need openExternal;
        // openPath only understands filesystem paths.
        openPath: (target) => {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return shell.openExternal(target);
            return shell.openPath(target).then((err) => {
                if (err) console.error(`Could not open "${target}": ${err}`);
            });
        },
    });

    const data = readProfiles();
    if (migrateDevices(data)) writeProfiles(data);
    learningDevice = data.settings.devices.length === 0;

    engine.on('key', (k) => {
        if (!learningDevice) return;
        // First key pressed while pairing wins - same contract LuaMacros had.
        const hwid = k.hwid || engine.devices.get(k.device);
        if (!hwid) return;
        pairDevice(hwid);
    });

    engine.on('warning', ({ macro, unknown }) => {
        console.warn(`Macro [${macro.visualKey}] has unsupported send tokens: ${unknown.join(', ')}`);
    });

    engine.on('error', (err) => {
        console.error('Engine error:', err.message);
        if (!mainWindow) return;

        // A missing driver is a setup step with a way forward, not a dead end.
        if (err.setup) return showDriverSetup(err.message);

        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Macropad Studio',
            message: 'The macro engine could not start.',
            detail: err.message,
        });
    });

    engine.start();

    if (mainWindow) {
        // A profile saved by the LuaMacros build has an 8-character id that means nothing to
        // Interception, so say "press a key" rather than letting the UI claim it is connected.
        mainWindow.webContents.send(learningDevice ? 'hardware-learning' : 'hardware-locked');
    }
}

// --- IPC LISTENERS (Brain <-> UI Communication) ---
// Saving is now just persistence. The engine reads profiles.json on every press, so there
// is no script to regenerate and no process to restart.
ipcMain.on('save-macros', (event, data) => {
    // settings.devices belongs to main - pairing writes it. The renderer holds a copy of
    // settings taken at startup and would write a stale one back, silently unpairing every
    // macropad on the next save. Always keep what is on disk.
    const onDisk = readProfiles();
    if (!data.settings) data.settings = {};
    data.settings.devices = (onDisk.settings && onDisk.settings.devices) || [];
    delete data.settings.hardwareId;

    writeProfiles(data);
    pushOverlay(data);
});

ipcMain.handle('load-macros', () => {
    const jsonFilePath = path.join(app.getPath('userData'), 'profiles.json');
    if (fs.existsSync(jsonFilePath)) {
        // Migrate before handing it over, so the renderer never holds the pre-devices shape
        const data = readProfiles();
        if (migrateDevices(data)) writeProfiles(data);
        return data;
    }
    return { activeProfile: "Default", profiles: { "Default": [] }, settings: { autoApply: false } };
});

// --- DEVICE MANAGEMENT ---
ipcMain.handle('list-devices', () => pairedDevices());

ipcMain.on('pair-device', () => {
    learningDevice = true;
    if (!engine) startEngine();
});

ipcMain.on('update-device', (event, { hwid, name, layout }) => {
    const data = readProfiles();
    migrateDevices(data);
    const dev = data.settings.devices.find((d) => d.hwid === hwid);
    if (!dev) return;
    if (name !== undefined) dev.name = name;
    if (layout !== undefined) dev.layout = layout;
    writeProfiles(data);
    if (mainWindow) mainWindow.webContents.send('devices-changed', data.settings.devices);
    pushOverlay(data);
});

ipcMain.on('remove-device', (event, hwid) => {
    const data = readProfiles();
    migrateDevices(data);
    data.settings.devices = data.settings.devices.filter((d) => d.hwid !== hwid);
    writeProfiles(data);
    if (engine) engine.syncTargets();
    if (mainWindow) mainWindow.webContents.send('devices-changed', data.settings.devices);
    pushOverlay(data);
});

// The editor asks for the next key pressed on a macropad, so a binding is made by
// pressing the physical key rather than guessing its code on the main keyboard.
ipcMain.on('capture-key', () => {
    if (!engine) return;
    engine.captureNextKey((k) => {
        const dev = pairedDevices().find((d) => d.hwid === k.hwid);
        if (mainWindow) {
            mainWindow.webContents.send('key-captured', {
                keyId: k.vk,
                hwid: k.hwid,
                deviceName: dev ? dev.name : 'Macropad',
            });
        }
    });
});

ipcMain.on('cancel-capture', () => { if (engine) engine.cancelCapture(); });

ipcMain.on('driver-setup', () => showDriverManage());

ipcMain.on('start-engine', () => {
    startEngine();
});

ipcMain.on('close-decision', (event, decision) => {
    if (decision === 'minimize') {
        mainWindow.hide();
    } else if (decision === 'quit') {
        appIsQuitting = true;
        app.quit();
    }
});

ipcMain.on('toggle-overlay', () => {
    if (overlayWindow.isVisible()) {
        overlayWindow.hide();
    } else {
        pushOverlay();   // it may never have been sent anything this session
        overlayWindow.showInactive();
    }
});

// --- Overlay Interaction Toggler ---
ipcMain.on('set-overlay-interactive', (event, interactive) => {
    // We assume your overlay window variable is named overlayWindow
    if (overlayWindow) {
        if (interactive) {
            // Make it solid so you can click the button
            overlayWindow.setIgnoreMouseEvents(false);
        } else {
            // Turn it back into a ghost when the mouse leaves the button
            overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        }
    }
});

// --- NEW: IMPORT & EXPORT LOGIC ---
ipcMain.handle('export-profile', async (event, profileData) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Macropad Profile',
        defaultPath: 'my_macros.mps',
        filters: [{ name: 'Macropad Studio Profile', extensions: ['mps'] }]
    });

    if (filePath) {
        // We wrap the data in a "Signature" so we know it's our file
        const filePayload = {
            _isMacropadStudioFile: true,
            version: "1.0",
            macros: profileData
        };
        fs.writeFileSync(filePath, JSON.stringify(filePayload, null, 2), 'utf-8');
        return true;
    }
    return false;
});

ipcMain.handle('import-profile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Macropad Profile',
        filters: [{ name: 'Macropad Studio Profile', extensions: ['mps'] }],
        properties: ['openFile']
    });

    if (!canceled && filePaths.length > 0) {
        try {
            const rawData = fs.readFileSync(filePaths[0], 'utf-8');
            const parsedData = JSON.parse(rawData);
            
            // Check for our custom flag!
            if (parsedData._isMacropadStudioFile) {
                return parsedData.macros; 
            } else {
                return { error: "Invalid or corrupted .mps file." };
            }
        } catch (e) {
            return { error: "Failed to read the file." };
        }
    }
    return null;
});

app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Wake up the window
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
    
    // Look for the .mps file in the command line arguments
    const filePath = commandLine.find(arg => arg.endsWith('.mps'));
    if (filePath) handleExternalMpsFile(filePath);
});

function handleExternalMpsFile(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const parsedData = JSON.parse(rawData);
        if (parsedData._isMacropadStudioFile) {
            mainWindow.webContents.send('load-external-profile', parsedData.macros);
        }
    } catch (e) {
        console.error("Failed to load external file:", e);
    }
}

ipcMain.on('reset-hardware-id', () => {
    const data = readProfiles();
    migrateDevices(data);
    data.settings.devices = [];
    writeProfiles(data);
    if (mainWindow) mainWindow.webContents.send('devices-changed', []);
    pushOverlay(data);

    // Forget every paired macropad and go back to pairing mode: the next key pressed on
    // any keyboard becomes the first device again.
    learningDevice = true;
    if (engine) engine.syncTargets();
    else startEngine();
});

// --- APP LIFECYCLE ---
app.whenReady().then(() => {
  createWindow();

  // Check if the app was launched FROM a file for the very first time
    const filePath = process.argv.find(arg => arg.endsWith('.mps'));
    if (filePath) {
        // Wait for the UI to finish loading before sending the data
        mainWindow.webContents.once('did-finish-load', () => {
            handleExternalMpsFile(filePath);
        });
    }

  // System Tray
  const iconPath = path.join(__dirname, 'assets/icon.ico');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Macropad Studio', click: () => { mainWindow.show(); } },
      { label: 'Quit', click: () => { 
          appIsQuitting = true; 
          app.quit(); 
      }}
  ]);
  
  tray.setToolTip('Macropad Studio');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); });

  app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe') 
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// --- FINAL CLEANUP ---
app.on('will-quit', () => {
    console.log("Cleaning up all background processes...");

    // Release the captured keyboard first - if the worker dies holding the filter,
    // the macropad stays swallowed until the driver notices the context is gone.
    if (engine) { engine.stop(); engine = null; }

});