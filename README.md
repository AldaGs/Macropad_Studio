<div align="center">
  <img src="src/assets/icon.ico" width="128" alt="Macropad Studio Logo">
  
  # Macropad Studio

  **Turn any secondary keyboard or numpad into a fully customizable, profile-driven command center.**
</div>

---

## Overview

Macropad Studio is a Windows desktop application built with **Electron** and **Node.js**. It captures keystrokes from a designated secondary keyboard before they reach Windows, letting you remap them to complex shortcuts, launch applications, or run raw AHK v2 code without interfering with your primary keyboard.

Capture runs through the [Interception](https://github.com/oblitum/Interception) kernel filter driver, so the macropad is grabbed below the OS keyboard stack. Nothing leaks through to whatever app has focus, and there is no helper process to babysit.

## Features

* **Visual Editor:** A sleek, dark-mode satisfying UI to program keys effortlessly.
* **Profile Management:** Create unlimited profiles (e.g., "Premiere Pro", "Gaming", "Coding") and switch between them instantly.
* **Import & Export:** Share your setups! Export your profiles as custom `.mps` files and double-click them to import them later.
* **On-Screen Display (OSD):** Optional, non-intrusive floating notifications tell you exactly what macro you just triggered.
* **Interactive Overlay:** A transparent, floating ghost window that shows your current key mappings. Hover over keys to see the active keys physically depress on-screen.
* **System Tray Integration:** Runs silently in the background with native OS tray notifications. Close the window to minimize it to the tray, keeping your macros active without cluttering your taskbar.
* **Auto-Start:** Launch with Windows and reconnect automatically to your saved macropad, with the option to start minimized straight to the tray.
* **Draggable Overlay Chassis:** Reposition the floating keyboard overlay anywhere on screen; its position is remembered between sessions.
* **Auto-Run:** Designate a specific profile to load automatically when your computer boots.

## Tech Stack

* **Frontend:** HTML, CSS, vanilla JavaScript
* **Backend:** Node.js (Electron `ipcMain`)
* **Hardware Interception:** Interception driver, called from Node through [koffi](https://koffi.dev) on a worker thread
* **Execution Engine:** Win32 `SendInput` for shortcuts, `child_process` for launching programs
* **Custom Macros:** AutoHotkey v2, spawned on demand

## Requirements

The Interception driver must be installed once before Macropad Studio can capture a keyboard.

1. Download a release from [oblitum/Interception](https://github.com/oblitum/Interception/releases) and extract it.
2. Open a terminal **as Administrator** and run `command line installer\install-interception.exe`.
3. **Reboot.** Keyboards and mice may behave oddly until you do.

## Installation & Setup

If you want to clone this repository and run it locally in developer mode:

1. **Clone the repo:**
    ```
    git clone https://github.com/AldaGs/Macropad_Studio.git
    ```

2. **Navigate into the folder:**
    ```
    cd macropad-studio
    ```

3. **Install dependencies:**
    ```
    npm install
    ```

4. **Run the app:**
    ```
    npm start
    ```

## Building the installer

To compile the app into a standalone Windows .exe installer:

```
npm run build
```

## How to Use

1. **Connect your Macropad:** Open the app and click 🔗 Connect Macropad, then press a key on your secondary keyboard. That device is now linked and its keys stop reaching Windows. (The pairing press itself still goes through — every press after it is captured.)

2. **Map a Key:** Click the "1. Press key" input box, then press the key you want to program.

3. **Assign an Action:** Choose whether to send a keyboard shortcut (e.g., Ctrl+Shift+C), launch a program (e.g., `C:\Photoshop.exe`), or run raw AHK v2 code.

4. **Save:** Click 💾 Save & Apply Profile. Changes take effect immediately — there is no script to compile and no process to restart.

5. **Switching Devices:** To use a different secondary keyboard, open Settings and click 🔄 Reset Macropad Connection. The next key you press on any keyboard becomes the new macropad.

### Permanent AHK helpers

Custom macros run as AutoHotkey v2. Anything you put in `%APPDATA%\macropad-studio\user_custom.ahk` is included by every custom macro and is never overwritten by the app.

## Troubleshooting

**"The macro engine could not start."** The Interception driver is not installed, or the machine has not rebooted since installing it. See [Requirements](#requirements).

**Status says "Waiting for keypress…" after upgrading.** Versions before the engine swap stored an 8-character device fragment that the driver cannot match. Press any key on your macropad once to re-link it. Your macros are unaffected.

**A shortcut does nothing.** Shortcuts use AHK `Send` syntax. Most of it is supported, but held states (`{Key down}`), repeat counts (`{Key 5}`), and `{Raw}`/`{Text}`/`{Blind}` modes are not. Run `node src/send-parser.js --coverage` to see how every shortcut in your profiles is being interpreted.

## Development

Two self-checks, both runnable without hardware:

```
node src/send-parser.js --self-test    shortcut syntax parsing
node src/engine.js --self-test         SendInput encoding and toast text
```

To inspect devices directly, `node spike-interception.js` prints the hardware ID and key codes of every keyboard without blocking anything. Pass a device number to capture that one.

## Future Roadmap

* [x] Support more than one keyboard at a time
* [ ] MIDI controllers as a macro source
* [ ] Raw HID for custom QMK/ZMK builds
* [ ] Port custom macros from AHK to JS and drop the AutoHotkey dependency

Built with passion by Aldair Gonzalez.
