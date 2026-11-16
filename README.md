# ETS2 RR Controller

Turn an Android phone into a steering wheel, pedals and dashboard for **Euro Truck Simulator 2** (also works with American Truck Simulator).

```
 Android app (Expo / React Native)                 Windows companion (Node.js)                 ETS2
 ┌──────────────────────────────┐  WebSocket   ┌────────────────────────────────┐
 │ wheel · pedals · buttons     │ ───────────▶ │ vJoy virtual joystick (axes,   │ ──────▶ joystick input
 │ invisible look-around area   │  20-byte     │ buttons) · SendInput keys/mouse │
 │ speedo · RPM · fuel · R/N/D  │  frames      │ gear sequencer · failsafe       │
 │                              │ ◀─────────── │ SCS telemetry reader            │ ◀────── scs-telemetry.dll
 └──────────────────────────────┘  telemetry   └────────────────────────────────┘         (shared memory)
        USB:  adb reverse tcp:8765 → 127.0.0.1:8765   ·   Wi-Fi: same LAN, auto-discovery or manual IP
```

No accounts, ads, payments or external servers. Everything runs on your phone and PC.

---

## Project structure

```
├─ src/                      Android app (Expo Router)
│  ├─ app/
│  │  ├─ _layout.tsx         root stack, immersive mode, gesture root
│  │  ├─ index.tsx           controller dashboard (responsive layout)
│  │  └─ settings.tsx        settings screen
│  ├─ components/            SteeringWheel, Pedal, PressButton, LookArea, Speedometer,
│  │                         TopBar, GearSelector, ConnectionPanel, BindingEditor, icons …
│  └─ lib/
│     ├─ connection.ts       WebSocket link: send loop, heartbeat, reconnect, telemetry store
│     ├─ discovery.ts        Wi-Fi subnet scan for the companion
│     ├─ input.ts            live input state written by gestures
│     ├─ settings.ts         persisted settings (expo-file-system)
│     └─ haptics.ts, store.ts, theme.ts
├─ shared/protocol.ts        wire protocol shared by app and companion
├─ companion/                Windows companion
│  ├─ src/
│  │  ├─ index.ts            entry point
│  │  ├─ server.ts           HTTP + WebSocket server, failsafe watchdog, dashboard feed
│  │  ├─ output.ts           frames → vJoy axes/buttons, keys, mouse (min press time, ref-counting)
│  │  ├─ gear.ts             R/N/D sequencer (closed loop with telemetry)
│  │  ├─ telemetry.ts        scs-sdk-plugin shared-memory reader
│  │  ├─ adb.ts              automatic `adb reverse` for USB mode
│  │  ├─ config.ts           config.json load/save
│  │  └─ win32/              vjoy.ts, sendinput.ts, sharedmem.ts (koffi FFI)
│  ├─ test/                  node:test suite
│  ├─ ui/index.html          local status dashboard
│  ├─ start-companion.bat    double-click launcher
│  └─ allow-firewall.ps1     firewall rule for Wi-Fi mode
├─ app.json · eas.json · metro.config.js
```

---

## 1. Windows PC setup

### 1.1 Install Node.js
Install **Node.js 20 LTS or newer** from <https://nodejs.org/>.

### 1.2 Install the vJoy driver (virtual joystick)
1. Download **vJoy 2.2.2.0** (or newer) from <https://github.com/BrunnerInnovation/vJoy/releases>. This build is signed for Windows 10/11. Older 2.1.x/2.2.1 installers often fail on Windows 11.
2. If an old vJoy is installed, uninstall it and reboot first.
3. Run the installer and reboot if it asks you to.
4. Open **Configure vJoy** (Start menu) and set up device **1**:
   - Axes: **X, Y, Z, Rx, Ry** (others optional)
   - Number of buttons: **32**
   - POV hat switches: **0**
   - Tick **Enable vJoy**, then **Apply**.

> Why vJoy: ViGEmBus (virtual Xbox pad) was archived and declared end-of-life in Nov 2023. vJoy is a DirectInput joystick that ETS2 reads like a real wheel, with independent analog axes for steering, throttle and brake and up to 128 buttons.

### 1.3 Install the telemetry plugin (speed, RPM, fuel, lights)
1. Download `release_v_1_12_1.zip` from <https://github.com/RenCloud/scs-sdk-plugin/releases/tag/V.1.12.1>.
2. Copy `release_v_1_12_1/Win64/scs-telemetry.dll` into
   `…\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\`
   (create the `plugins` folder if it doesn't exist).
3. Start ETS2. It asks once to confirm the "SDK features": click **OK**.

The companion reads the plugin's shared memory (`Local\SCSTelemetry`, plugin revision 12). If the game isn't running or the plugin is missing, the phone shows **NO DATA** / `--`. It never shows invented values.

### 1.4 Start the companion
Double-click `companion\start-companion.bat`. On the first run it installs dependencies and builds. Or from a terminal:

```bash
cd companion
npm install
npm start           # builds and runs; opens the dashboard at http://127.0.0.1:8765/
```

The console and the dashboard show the vJoy, telemetry, keyboard and USB status. Settings live in `companion\config.json`, which is created on the first run (port, vJoy device, camera mode, mappings, failsafe timeout, …).

### 1.5 USB support (adb)
The companion runs `adb reverse tcp:8765 tcp:8765` automatically for every connected phone. It looks for `adb.exe` in this order:
`companion\platform-tools\`, `%ANDROID_HOME%`, `%LOCALAPPDATA%\Android\Sdk\platform-tools\`, then `PATH`.
If you don't have it, download **SDK Platform-Tools for Windows** from <https://developer.android.com/tools/releases/platform-tools> and extract it so that `companion\platform-tools\adb.exe` exists.

### 1.6 Wi-Fi only: allow the firewall
When Windows asks, allow Node.js on **Private** networks. Or run this in an elevated PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File companion\allow-firewall.ps1
```
Make sure your Wi-Fi network profile is **Private**. If you only use USB, set `"listenHost": "127.0.0.1"` in `config.json` so the companion isn't reachable from the LAN.

---

## 2. Android app

### 2.1 Build the APK

**Option A: EAS cloud build (no Android SDK needed)**
```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview     # produces an installable .apk
```

**Option B: local build (Android SDK + JDK 17 installed)**
```bash
npm install
npx expo prebuild -p android --clean
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```
This release APK is signed with the debug keystore, which is fine for sideloading. For Play Store distribution, use EAS or configure your own keystore. The `android/` folder is generated (Continuous Native Generation), so don't edit it by hand.

Install it: `adb install -r app-release.apk`, or copy the file to the phone and open it.

**Development:** `npx expo start`, then open the app in a development build (`npx expo run:android`). Every native module used here is also in Expo Go, so Expo Go works for quick UI tests.

### 2.2 Phone preparation (USB mode)
1. **Settings → About phone → tap "Build number" 7 times** to enable Developer options.
2. **Settings → System → Developer options → USB debugging: ON.**
3. Plug the phone into the PC and accept **"Allow USB debugging?"** (tick "Always allow").
4. The companion console shows `USB ready: adb reverse tcp:8765 active.`
5. Open the app. Mode **USB** is the default, and it connects to `127.0.0.1:8765` through the cable. No Wi-Fi or internet is needed.

### 2.3 Wi-Fi mode
Menu (☰) or Settings → **Wi-Fi**. The app scans its /24 subnet for the companion (`GET /discover`). If the scan fails (guest networks or client isolation), enter the PC IP that the companion console prints, e.g. `192.168.1.5`.

---

## 3. Configure ETS2 (one time)

ETS2 stores controls per profile. In **Options → Controls**:

1. **Input device:** pick the profile for keyboard plus a joystick/wheel (the name differs slightly between game versions) and select **vJoy Device**.
2. **Steering axis:** vJoy **X**. Turn the phone wheel to bind it.
3. **Throttle axis:** vJoy **Y**. **Brake axis:** vJoy **Z**. The pedals rest at the axis minimum (0 %) and go to maximum at full press.
   If the truck accelerates or brakes while the pedal is released, toggle the axis's **inverted** option and/or switch its range to the full (non-centred) mode.
4. Leave ETS2's steering dead zone at 0. The app has its own. Adjust steering sensitivity/non-linearity to taste.
5. **Keys & Buttons:** bind each action to its vJoy button. While ETS2 waits for input, press the matching control on the phone dashboard. For actions without an on-screen button (Shift up/down/neutral, High beam), use **Settings → Button / key mapping → Test** on the phone, or **Test** in the companion dashboard (it has a 3–5 s delay so you can click into the game first).

| Action | ETS2 control | Default vJoy button |
|---|---|---|
| Horn | Horn | 1 |
| PASS | Light horn | 2 |
| Left / right indicator | Left / Right blinker | 3 / 4 |
| Hazard | Hazard warning | 5 |
| Headlights | Light modes | 6 |
| High beam | High beam headlights | 7 |
| Beacon | Beacon | 8 |
| Wipers | Wipers | 9 |
| Parking brake | Parking brake | 10 |
| Cruise control | Cruise control | 11 |
| Camera | Next camera | 12 |
| Gear D / R | Shift up / Shift down | 13 / 14 |
| Gear N | Shift to neutral (optional) | 15 |

6. **R / N / D** needs **Transmission: Automatic** (Gameplay settings). The companion presses Shift up/down until the telemetry gear matches the target (R ↔ N ↔ D). Without telemetry it steps open-loop. Stop the truck before selecting R.
7. **Camera look:** the invisible area at the top right of the dashboard (and the free space above the pedals) sends relative mouse movement, so ETS2 must be the focused window with **mouse steering off**. Alternatively, in the companion dashboard switch **Camera look mode → vJoy axes RX/RY** and bind those axes to ETS2's camera rotation controls.

**Keyboard instead of vJoy buttons:** in the mapping editor (phone or dashboard), choose **Key** and enter a key name: `A`–`Z`, `0`–`9`, `F1`–`F24`, `SPACE`, `ENTER`, `LSHIFT`, `LCTRL`, `[`, `]`, `NUM0`–`NUM9`, arrow keys, and so on. Keys are sent as hardware scan codes and need ETS2 to be the focused window. If ETS2 runs as administrator, the companion must too (Windows blocks input into elevated apps).

### Hold vs toggle behaviour
Every phone button holds its mapped vJoy button/key exactly as long as your finger is down (minimum 60 ms, so quick taps are never missed). ETS2 then applies its own logic, like a physical wheel button:
- **Momentary:** Horn, PASS (light horn flashes the high beam only while held). Neither is a toggle.
- **Toggle in-game:** indicators, hazard, light modes, wipers, beacon, parking brake, cruise control. Their lit state on the phone comes from **telemetry**, so it always matches the truck, and indicators blink in sync.

---

## 4. Using the controller

- **Steering wheel:** drag around the rim. The wheel follows your finger's angle and supports multiple turns up to the configured range (default 540°, up to 900°). With auto-centering on, it returns to centre when released.
- **Pedals:** the finger position sets the value: bottom edge = 0 %, top edge = 100 %. Slide to modulate. They return to 0 on release. The gold bar beside each pedal shows the output.
- **Multi-touch:** wheel, both pedals, PASS/HORN and the look area work at the same time. Every control uses its own native gesture handler.
- **Top bar:** live RPM and fuel %, link status (USB / Wi-Fi with IP), tap the chip to reconnect, gear icon for settings, ☰ for connection details (vJoy/telemetry status, latency).
- The screen stays awake while the controller is open.

### Settings
Connection (USB / Wi-Fi, IP, port) · steering range, sensitivity, dead zone, auto-centering + speed · pedal response curve and calibration (start dead zone / full point per pedal, with a live preview) · camera sensitivity and invert · haptics · button/key mapping (stored on the PC) · reset to defaults.

---

## 5. Reliability

- **Low latency:** a frame is sent the moment an input changes (max ~125 Hz) as a 20-byte binary message over a single WebSocket with Nagle disabled. A 200 ms heartbeat runs while idle. Telemetry is quantised and only sent when it changes.
- **Connection loss:** if the companion receives no frame for 600 ms (configurable) or the socket closes, it centres the steering, zeroes throttle/brake and releases every button and key. The phone also releases all inputs when it disconnects or goes to the background, and reconnects automatically with backoff.
- **Second phone:** the newest connection takes over and the previous one stops (no reconnect fight).

---

## 6. Development & tests

```bash
npm run typecheck && npm run lint          # app
npm --prefix companion test                # companion: 14 tests
```

The companion tests run against real Win32 APIs: a named file mapping laid out exactly like the plugin's, a `SendInput` structure check, and a full WebSocket session including the disconnect and stall failsafes.

### What has been verified on a PC without a phone, vJoy or ETS2
- Protocol encode/decode; telemetry offsets parsed through `OpenFileMapping`/`MapViewOfFile`; `SendInput` accepted by Windows; key-name mapping; output logic (minimum press, ref-counting, neutralise); R/N/D closed loop; server failsafes.
- The app's web build in headless Edge, connected to the real companion over the real protocol: simultaneous wheel + accelerator + horn touches arrived as `steer 0.49 / throttle 0.54 / horn held` and returned to 0 on release. The look area produced camera input without affecting PASS.
- Companion startup, discovery endpoint, dashboard, adb detection.

### Needs physical testing on your hardware
- Touch feel, multi-touch and haptics on your Android phone; USB `adb reverse` with your device; Wi-Fi discovery on your network.
- vJoy device acquisition and axis/button input inside ETS2 (vJoy wasn't installed on the build machine).
- Telemetry with the real game and plugin (offsets come from plugin v1.12.1's header and were tested against an emulated mapping).
- R/N/D behaviour with your ETS2 transmission settings, and mouse free-look sensitivity.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Phone: "Waiting for USB…" | Companion running? USB debugging accepted? Companion console should show `adb reverse … active`. Try another cable or port and set the USB mode to "File transfer". |
| Phone: "PC not found" (Wi-Fi) | Same network? Firewall rule (§1.6)? Enter the IP manually. Some routers isolate clients on guest Wi-Fi. |
| Dashboard: "vJoy not installed / not enabled / device busy" | Install vJoy 2.2.x, enable device 1, close other vJoy feeders (UCR, FreePIE, Joystick Gremlin). |
| Dashboard: "only N buttons" | Configure vJoy → 32 buttons → Apply. Restart the companion. |
| ETS2 accelerates by itself | Invert the throttle axis or change its range mode in ETS2 (§3.3). |
| Buttons work, keys/mouse look don't | Click into ETS2 so it's focused. Run the companion as admin if ETS2 runs as admin. |
| Telemetry "revision N, expected 12" | Use scs-sdk-plugin **v1.12.x** (Win64). |
| Indicator state wrong without telemetry | Without the plugin the app can't know the game state, so buttons only light while pressed. Install the plugin. |
