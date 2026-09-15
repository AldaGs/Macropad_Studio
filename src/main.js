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

    const saved = readProfiles().settings && readProfiles().settings.hardwareId;
    learningDevice = !isUsableHwid(saved);

    engine.on('key', (k) => {
        if (!learningDevice) return;
        // First key pressed while learning wins - same contract LuaMacros had.
        const hwid = engine.devices.get(k.device);
        if (!hwid) return;
        learningDevice = false;

        const data = readProfiles();
        if (!data.settings) data.settings = {};
        data.settings.hardwareId = hwid;
        writeProfiles(data);
        engine.setTarget(hwid);

        if (mainWindow) mainWindow.webContents.send('hardware-locked');
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
    writeProfiles(data);

    const macros = (data.profiles && data.profiles[data.activeProfile]) || [];
    if (overlayWindow) {
        overlayWindow.webContents.send('update-overlay', macros);
    }
});

ipcMain.handle('load-macros', () => {
    const jsonFilePath = path.join(app.getPath('userData'), 'profiles.json');
    if (fs.existsSync(jsonFilePath)) {
        return JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
    }
    return { activeProfile: "Default", profiles: { "Default": [] }, settings: { autoApply: false } };
});

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
    // The saved ID actually lives in profiles.json's settings.hardwareId,
    // which is what startEngine() reads to decide auto-connect vs. recording mode.
    const jsonFilePath = path.join(app.getPath('userData'), 'profiles.json');
    if (fs.existsSync(jsonFilePath)) {
        try {
            const currentData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
            if (currentData.settings) currentData.settings.hardwareId = "";
            fs.writeFileSync(jsonFilePath, JSON.stringify(currentData, null, 2), 'utf-8');
        } catch (e) { console.error(e); }
    }

    const hardwareIdFile = path.join(app.getPath('userData'), 'macropad_id.txt');
    if (fs.existsSync(hardwareIdFile)) {
        fs.unlinkSync(hardwareIdFile); // legacy file, clear it too just in case
    }

    // Drop the target and go back to learning mode: the next key pressed on any keyboard
    // becomes the new macropad. No restart needed, the worker keeps running.
    learningDevice = true;
    if (engine) engine.setTarget(null);
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