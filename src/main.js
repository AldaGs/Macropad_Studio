const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog } = require('electron'); // ADDED dialog
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process'); 

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
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 980,
    title: "Macropad Studio",
    icon: path.join(__dirname, 'assets/icon.ico'),
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
    height: 330,
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
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
}

// --- BACKGROUND WORKERS ---
function startBackgroundWorkers() {
    const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
    const luaDir = path.join(baseDir, 'bin/LuaMacros');
    const luaExe = path.join(luaDir, 'LuaMacros.exe');
    // We no longer need the luaScript absolute path variable!

    exec(`taskkill /f /im LuaMacros.exe`, () => {
        // THE FIX: We pass exactly 'start.lua' to the ArgumentList. 
        // Because the WorkingDirectory is already inside the LuaMacros folder, it finds it instantly!
        const psCommand = `powershell -WindowStyle Hidden -Command "Start-Process -FilePath '${luaExe}' -ArgumentList 'start.lua', '-r' -WorkingDirectory '${luaDir}' -WindowStyle Hidden"`;
        
        exec(psCommand, (err) => {
            if (err) console.error("PowerShell Error:", err);
        });
    });
}

// --- IPC LISTENERS (Brain <-> UI Communication) ---
ipcMain.on('save-macros', (event, data) => {
    const jsonFilePath = path.join(app.getPath('userData'), 'profiles.json');
    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf-8');

    const userDataPath = app.getPath('userData').replace(/\\/g, '/'); 
    
    const customFilePath = path.join(app.getPath('userData'), 'user_custom.ahk');
    if (!fs.existsSync(customFilePath)) {
        fs.writeFileSync(customFilePath, `; Put your permanent custom AHK v2 code here!\n; This file will NEVER be overwritten by Macropad Studio.\n`, 'utf-8');
    }

    let ahkCode = `#Requires AutoHotkey v2.0\n#SingleInstance Force\n\n`;
    ahkCode += `#Include "${customFilePath.replace(/\\/g, '/')}"\n\n`;

    // --- NEW: Inject the OSD Graphics Engine if the setting is ON ---
    if (data.settings && data.settings.showOSD) {
        ahkCode += `
        ; --- OSD Notification Engine ---
        global ToastGui := ""

        ShowToast(msg) {
            global ToastGui
            
            ; 1. If a notification is already on screen, destroy it so they don't overlap
            if (ToastGui) {
                ToastGui.Destroy()
            }

            ; 2. Build a brand new window
            ToastGui := Gui("-Caption +AlwaysOnTop +ToolWindow +E0x20")
            ToastGui.BackColor := "28a745"
            ToastGui.SetFont("s16 cWhite bold", "Segoe UI")
            ToastGui.MarginX := 25
            ToastGui.MarginY := 12

            ; 3. Add the text DURING creation so AHK calculates the exact width immediately!
            ToastGui.Add("Text", "Center", msg) 
            WinSetTransparent(200, ToastGui)

            ; 4. Measure the newly minted window
            ToastGui.Show("Hide")
            ToastGui.GetPos(&X, &Y, &W, &H)
            
            ; 5. Carve the rounded corners
            WinSetRegion("0-0 w" W " h" H " r15-15", ToastGui.Hwnd)
            
            ; 6. Center it and show it
            CenterX := (A_ScreenWidth / 2) - (W / 2)
            ToastGui.Show("NoActivate y" (A_ScreenHeight - 120) " x" CenterX)
            
            SetTimer(HideToast, -1000)
        }

        HideToast() {
            global ToastGui
            if (ToastGui) {
                ToastGui.Destroy()
                ToastGui := ""
            }
        }
        \n`;
    }

    ahkCode += `~F24::\n{\n`;
    ahkCode += `    SavedKey := FileRead("${userDataPath}/pressed_key.txt")\n\n`;

    // Loop through the active profile
    const activeProfile = data.activeProfile;
    const macros = data.profiles[activeProfile] || [];

    macros.forEach(macro => {
        ahkCode += `    if (SavedKey == "${macro.keyId}") {\n`;
        
        // --- NEW: Trigger the OSD before executing the action ---
        if (data.settings && data.settings.showOSD) {
            // Use the custom description if they wrote one, otherwise use the visual value
            let descriptor = macro.desc ? macro.desc : macro.visualValue;
            // Escape any quotes so it doesn't break the AHK string
            descriptor = descriptor.replace(/"/g, '""'); 
            ahkCode += `        ShowToast("${descriptor}")\n`;
        }

        // Add the actual action
        if (macro.type === 'send') {
            ahkCode += `        Send("${macro.value}")\n`;
        } else if (macro.type === 'run') {
            ahkCode += `        Run("${macro.value}")\n`;
        } else if (macro.type === 'custom') {
            const indentedCustom = macro.value.split('\n').map(line => `        ${line}`).join('\n');
            ahkCode += `${indentedCustom}\n`;
        }
        ahkCode += `    }\n`;
    });

    ahkCode += `}\n`;

    const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
    const ahkFilePath = path.join(app.getPath('userData'), 'macros.ahk');
    fs.writeFileSync(ahkFilePath, ahkCode, 'utf-8');
    
    const ahkExe = path.join(baseDir, 'bin/AutoHotkey/AutoHotkey64.exe');
    exec(`"${ahkExe}" "${ahkFilePath}"`, (err) => {
        if (err) console.error("AHK Error:", err);
    });

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

ipcMain.on('start-luamacros', () => {
    startBackgroundWorkers();
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
    
    // Kill the key listener (LuaMacros)
    exec(`taskkill /f /im LuaMacros.exe`, (err) => {
        if (err) console.log("LuaMacros already closed or not found.");
    });

    // Kill the shortcut engine (AutoHotkey)
    // We use the filename we standardized earlier
    exec(`taskkill /f /im AutoHotkey64.exe`, (err) => {
        if (err) console.log("AutoHotkey already closed or not found.");
    });
});