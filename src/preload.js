const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Lane 1: Sending data to the Brain to be saved
    saveMacros: (macroData) => ipcRenderer.send('save-macros', macroData),
    
    // Asking the Brain for the saved data when the app opens
    // We use 'invoke' instead of 'send' because we want to wait for an answer!
    loadMacros: () => ipcRenderer.invoke('load-macros'),

    // Lane to manually start the macro engine on click
    startEngine: () => ipcRenderer.send('start-engine'),

    // Channels for the custom close popup
    onShowCloseModal: (callback) => ipcRenderer.on('show-close-modal', callback),
    sendCloseDecision: (decision) => ipcRenderer.send('close-decision', decision),

    // Overlay controls
    toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
    onUpdateOverlay: (callback) => ipcRenderer.on('update-overlay', callback),
    setOverlayInteractive: (interactive) => ipcRenderer.send('set-overlay-interactive', interactive),

    // Import and Export file dialogs
    exportProfile: (profileData) => ipcRenderer.invoke('export-profile', profileData),
    importProfile: () => ipcRenderer.invoke('import-profile'),

    onLoadExternalProfile: (callback) => ipcRenderer.on('load-external-profile', callback),

    resetHardwareId: () => ipcRenderer.send('reset-hardware-id'),
    onHardwareLocked: (callback) => ipcRenderer.on('hardware-locked', callback),

    // Fired when the engine has no usable hardware id and is waiting for a keypress
    onHardwareLearning: (callback) => ipcRenderer.on('hardware-learning', callback),

    // Toast window: the OSD is an Electron window now, not a generated AHK Gui
    onToast: (callback) => ipcRenderer.on('toast', callback)
});