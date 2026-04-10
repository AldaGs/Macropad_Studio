<div align="center">
  <img src="src/assets/icon.ico" width="128" alt="Macropad Studio Logo">
  
  # Macropad Studio

  **Turn any secondary keyboard or numpad into a fully customizable, profile-driven command center.**
</div>

---

## Overview

Macropad Studio is a Windows desktop application built with **Electron**, **Node.js**, **LuaMacros**, and **AutoHotkey v2**. It intercepts keystrokes from a designated secondary keyboard before they reach Windows, allowing you to remap them to complex shortcuts, launch applications, or execute raw AHK scripts without interfering with your primary keyboard.

## Features

* **Visual Editor:** A sleek, dark-mode satisfying UI to program keys effortlessly.
* **Profile Management:** Create unlimited profiles (e.g., "Premiere Pro", "Gaming", "Coding") and switch between them instantly.
* **Import & Export:** Share your setups! Export your profiles as custom `.mps` files and double-click them to import them later.
* **On-Screen Display (OSD):** Optional, non-intrusive floating notifications tell you exactly what macro you just triggered.
* **Interactive Overlay:** A transparent, floating ghost window that shows your current key mappings. Hover over keys to see the active keys physically depress on-screen.
* **System Tray Integration:** Runs silently in the background. Close the window to minimize it to the tray, keeping your macros active without cluttering your taskbar.
* **Auto-Run:** Designate a specific profile to compile and run automatically when your computer boots.

## Tech Stack

* **Frontend:** HTML, CSS, vanilla JavaScript
* **Backend:** Node.js (Electron `ipcMain`)
* **Hardware Interception:** LuaMacros (via hidden background processes)
* **Execution Engine:** AutoHotkey v2 (AHK)

## Installation & Setup

If you want to clone this repository and run it locally in developer mode:

1. **Clone the repo:**
    ```
   git clone [https://github.com/AldaGs/Macropad_Studio.git](https://github.com/AldaGs/Macropad_Studio.git)

2. **Navigate into the folder:**
    ```
    cd macropad-studio

3. **Install dependecies**
    ```
    npm install

4. **Run the app**:
    ```
    npm start

## Building the installer

To compile the app into a standalone Windows .exe installer
    
    npm run build
    
## How to Use
1. Connect your Macropad: Open the app and click 🔗 Connect Macropad. Press a key on your secondary keyboard so the Lua engine locks onto its hardware ID.

2. Map a Key: Click the "1. Press key" input box, then press the key you want to program.

3. Assign an Action: Choose whether to send a keyboard shortcut (e.g., Ctrl+Shift+C), launch a program (e.g., C:\Photoshop.exe), or run raw AHK v2 code.

4. Save & Apply: Click the 🚀 Save & Apply Profile button. The app will generate the background script and your macropad is ready to use!

## Future Roadmap
[ ] Add support for 3+ simultaneous keyboards/macropads.

Built with passion by Aldair Gonzalez.