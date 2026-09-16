<div align="center">
  <img src="src/assets/icon.ico" width="128" alt="Macropad Studio Logo">
  
  # Macropad Studio

  **Turn any secondary keyboard or numpad into a fully customizable, profile-driven command center.**
</div>

---

## Overview

Macropad Studio is a Windows desktop application built with **Electron** and **Node.js**. It captures keystrokes from a designated secondary keyboard before they reach Windows, letting you remap them to complex shortcuts, launch applications, or run JavaScript without interfering with your primary keyboard.

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
* **Multiple Macropads:** Pair several keyboards at once, each with its own overlay layout. Macros remember which board they belong to.

## Tech Stack

* **Frontend:** HTML, CSS, vanilla JavaScript
* **Backend:** Node.js (Electron `ipcMain`)
* **Hardware Interception:** Interception driver, called from Node through [koffi](https://koffi.dev) on a worker thread
* **Execution Engine:** Win32 `SendInput` for shortcuts, `child_process` for launching programs
* **Custom Macros:** JavaScript, run in-process

## Requirements

Macropad Studio needs the [Interception](https://github.com/oblitum/Interception) kernel driver to capture a keyboard. **The driver is bundled — you do not need to download anything.**

On first run the app notices the driver is missing and offers to install it:

1. Click **Install Driver**. Windows shows a UAC prompt for administrator rights.
2. Click **Restart Now** when asked. The driver only takes effect after a reboot.

That is it. You can reinstall or remove the driver later from **Settings → Interception Driver**. Removing it disables Macropad Studio until you install it again; other apps that use Interception will also be affected, since the driver is shared system-wide.

> **Note:** installation is deliberately a visible, consented step rather than something the installer does silently in the background. Interception's licence reserves silent embedded installation for its commercial tier, and a kernel driver is not something to install behind a user's back regardless.

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

2. **Map a Key:** Click the "1. Press key" input box, then press the key on the macropad itself. That records both which key it was and which board it came from.

3. **Assign an Action:** Choose whether to send a keyboard shortcut (e.g., Ctrl+Shift+C), launch a program (e.g., `C:\Photoshop.exe`), show the time as a toast, or run JavaScript.

4. **Save:** Click 💾 Save & Apply Profile. Changes take effect immediately — there is no script to compile and no process to restart.

5. **Switching Devices:** To use a different secondary keyboard, open Settings and click 🔄 Reset Macropad Connection. The next key you press on any keyboard becomes the new macropad.

### Multiple macropads

**Settings → Paired Macropads → Add Macropad**, then press a key on the new board. Each paired macropad gets a name and an overlay layout (full keyboard, tenkeyless, or numpad), and the overlay grows tabs to switch between them.

A profile covers all of your macropads at once, so switching profile re-maps every board together. Each macro remembers which board it was bound on, and a macro bound to a specific board wins over one left on "any macropad" — so you can share most of a profile and override only the keys that differ.

Because a macro with no board set fires on **every** macropad, pairing a second one offers to assign your existing macros to the first board. Take that offer unless you actually want the same keys on both.

### JavaScript macros

The **Run JavaScript** action gets a small helper set: `send('^c')`, `type('text')`, `await sleep(ms)`, `run('app.exe')`, `notify('msg')`, `beep(freq, ms)`, `clipboard.read/write/clear` and `await clipWait(ms)`. `fetch`, `Date` and the rest of Node are in scope too, and top-level `await` works.

```js
clipboard.clear();
send('^c');
const text = await clipWait(1000);
if (text) notify(`Copied ${text.length} characters`);
```

Macros exported from a version before v2 may contain raw AutoHotkey. AutoHotkey is no longer bundled; opening such a macro puts its old code in the JavaScript editor so you can rewrite it.

## Troubleshooting

**The driver setup dialog keeps reappearing.** The driver is installed but the machine has not rebooted yet, or the install was cancelled at the UAC prompt. Reboot, or retry from **Settings → Interception Driver**.

**Status says "Waiting for keypress…" after upgrading.** Versions before the engine swap stored an 8-character device fragment that the driver cannot match. Press any key on your macropad once to re-link it. Your macros are unaffected.

**A shortcut does nothing.** Shortcuts use AHK `Send` syntax. Most of it is supported, but held states (`{Key down}`), repeat counts (`{Key 5}`), and `{Raw}`/`{Text}`/`{Blind}` modes are not. Run `node src/send-parser.js --coverage` to see how every shortcut in your profiles is being interpreted.

## Development

Two self-checks, both runnable without hardware:

```
node src/send-parser.js --self-test    shortcut syntax parsing
node src/engine.js --self-test         SendInput encoding and toast text
```

To inspect devices directly, `node spike-interception.js` prints the hardware ID and key codes of every keyboard without blocking anything. Pass a device number to capture that one.

## Roadmap

**Done**

* [x] Drop the LuaMacros and AutoHotkey dependencies — capture and execution are both in-process
* [x] JavaScript macros
* [x] Multiple macropads at once, each with its own overlay layout

**Planned**

* [ ] **MIDI controllers as a macro source.** Electron ships the Web MIDI API, so this needs no new dependency — just hardware to test against.
* [ ] **Raw HID for custom QMK/ZMK builds.** A board with `RAW_ENABLE` can send macro events directly on usage page `0xFF60`, with no interception needed at all.

Both are designed but not built — neither has been tested against real hardware yet.

## Third-party components

[Interception](https://github.com/oblitum/Interception) by Francisco Lopes is bundled under its non-commercial LGPL-3.0 terms, which permit redistributing the driver and installer as long as the application talks to the driver only through the library API — which is what Macropad Studio does. The licence texts ship in `bin/Interception/licenses/`. **Commercial use of Macropad Studio would require a commercial Interception licence** (`francisco@oblita.com`).

Built with passion by Aldair Gonzalez.
