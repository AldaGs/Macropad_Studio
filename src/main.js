const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog, Notification } = require('electron'); 
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
}

// --- BACKGROUND WORKERS (The Autonomous Flow) ---
function startBackgroundWorkers() {
    const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
    const luaDir = path.join(baseDir, 'bin/LuaMacros');
    const luaExe = path.join(luaDir, 'LuaMacros.exe');

    const userDataPath = app.getPath('userData').replace(/\\/g, '/');
    const pressedKeyFile = `${userDataPath}/pressed_key.txt`;
    const dumpFile = path.join(app.getPath('userData'), 'devices_dump.txt');

    // 1. Read the saved Hardware ID
    const jsonFilePath = path.join(app.getPath('userData'), 'profiles.json');
    let savedId = "";
    if (fs.existsSync(jsonFilePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
            if (data.settings && data.settings.hardwareId) savedId = data.settings.hardwareId;
        } catch (e) { console.error(e); }
    }

    let luaScript = `clear()\nlocal key_file_path = "${pressedKeyFile}"\n`;

    // 2. The Logic Split
    if (savedId && savedId !== "") {
        // A. WE HAVE AN ID: Silent Auto-Boot using Lua's double brackets [[ ]] to ignore weird backslashes
        luaScript += `lmc_device_set_name('MACROS', [[${savedId}]])\n`;
        luaScript += `print("Auto-connected to saved Macropad!")\n`;
    } else {
        // B. NO ID: Inject the memory dump script
        luaScript += `
                    lmc_assign_keyboard('MACROS')

                    lmc.minimizeToTray = true
                    lmc_minimize() 

                    local function dumpData(o)
                        if type(o) == 'table' then
                            local s = '{ '
                            for k, v in pairs(o) do
                                if type(k) ~= 'number' then k = '"'..k..'"' end
                                s = s .. '['..k..'] = ' .. dumpData(v) .. ', '
                            end
                            return s .. '} '
                        else
                            return tostring(o)
                        end
                    end

                    local file = io.open("${dumpFile.replace(/\\/g, '/')}", "w")
                    if file then
                        local devices = lmc_get_devices()
                        for key, value in pairs(devices) do
                            file:write(tostring(key) .. ": " .. dumpData(value) .. "\\n")
                        end
                        file:close()
                    end
                    `;
                            
        // Clean up any old dump files before starting
        if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);

        // Tell Node to watch the folder for the dump file!
        const watcher = fs.watch(app.getPath('userData'), (eventType, filename) => {
            if (filename === 'devices_dump.txt') {
                
                // Give Windows a tiny 100ms buffer to finish writing the text to the file
                setTimeout(() => {
                    try {
                        const content = fs.readFileSync(dumpFile, 'utf-8');
                        // 1. Find the exact line LuaMacros assigned to 'MACROS'
                        const targetLine = content.split('\n').find(l => l.includes('["Name"] = MACROS'));
                        
                        if (targetLine) {
                            // 2. Extract the full SystemId string
                            const match = targetLine.match(/\["SystemId"\] = (.*?),/);
                            if (match && match[1]) {
                                let finalId = match[1].trim();
                                
                                // 3. Slice the string to extract ONLY the unique 8-character ID (e.g., 18B01A70)
                                // Format: \\?\HID#VID_046D&PID_C534...#8&18B01A70&0&0000#{...}
                                const hashParts = finalId.split('#');
                                if (hashParts.length >= 3) {
                                    const ampParts = hashParts[2].split('&');
                                    if (ampParts.length >= 2) {
                                        finalId = ampParts[1]; 
                                    }
                                }
                                
                                // 4. Save the clean ID to profiles.json instantly
                                const currentData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
                                if (!currentData.settings) currentData.settings = {};
                                currentData.settings.hardwareId = finalId;
                                fs.writeFileSync(jsonFilePath, JSON.stringify(currentData, null, 2), 'utf-8');
                                
                                // 5. Tell the UI the hardware is locked in!
                                if (mainWindow) mainWindow.webContents.send('hardware-locked');
                                watcher.close(); 
                            }
                        }
                    } catch(e) {
                        console.error("File read collision, ignoring...", e);
                    } 
                }, 100);
            }
        });
    }

    // 3. The Standard Key Listener
    luaScript += `
                lmc.minimizeToTray = true
                lmc_minimize() 
                lmc_set_handler('MACROS', function(button, direction)
                    if (direction == 1) then return end
                    local f = io.open(key_file_path, 'w')
                    if f then
                        f:write(button)
                        f:close()
                        lmc_send_keys('{F24}')
                    end
                end)
                `;

    fs.writeFileSync(path.join(luaDir, 'start.lua'), luaScript, 'utf-8');

    exec(`taskkill /f /im LuaMacros.exe`, () => {
        const psCommand = `powershell -WindowStyle Hidden -Command "Start-Process -FilePath '${luaExe}' -ArgumentList 'start.lua', '-r' -WorkingDirectory '${luaDir}' -WindowStyle Hidden"`;
        exec(psCommand);

        // --- NEW: THE MISSING UI SIGNAL ---
        // If we booted silently using an existing ID, tell the frontend it worked!
        if (savedId && savedId !== "") {
            setTimeout(() => {
                if (mainWindow) {
                    mainWindow.webContents.send('hardware-locked');
                }
            }, 500); // 500ms buffer to ensure LuaMacros is fully launched
        }
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

ipcMain.on('reset-hardware-id', () => {
    const hardwareIdFile = path.join(app.getPath('userData'), 'macropad_id.txt');
    if (fs.existsSync(hardwareIdFile)) {
        fs.unlinkSync(hardwareIdFile); // Deletes the saved ID
    }
    // Restart LuaMacros so it asks for a key press again
    startBackgroundWorkers(); 
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