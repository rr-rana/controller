// Installs the locally built release APK on the USB-connected Android phone.
// Usage: npm run install:apk
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

function findAdb() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const env = process.env;
  const candidates = [
    env.ANDROID_HOME && path.join(env.ANDROID_HOME, 'platform-tools', exe),
    env.ANDROID_SDK_ROOT && path.join(env.ANDROID_SDK_ROOT, 'platform-tools', exe),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe),
    path.join(root, 'companion', 'platform-tools', exe),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || 'adb'; // fall back to PATH
}

if (!fs.existsSync(apk)) {
  console.error(`APK not found: ${apk}\nBuild it first:  cd android  &&  .\\gradlew assembleRelease`);
  process.exit(1);
}

const adb = findAdb();
let devices;
try {
  devices = execFileSync(adb, ['devices'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 2 && p[0]);
} catch {
  console.error('adb not found. Install Android SDK Platform-Tools or set ANDROID_HOME.');
  process.exit(1);
}

const ready = devices.filter(([, state]) => state === 'device');
if (ready.length === 0) {
  const unauthorized = devices.some(([, state]) => state === 'unauthorized');
  console.error(
    unauthorized
      ? 'Phone is connected but unauthorized: accept the "Allow USB debugging" prompt on the phone and run again.'
      : 'No phone found. Enable USB debugging and connect the phone via USB.',
  );
  process.exit(1);
}

const sizeMb = (fs.statSync(apk).size / 1024 / 1024).toFixed(1);
for (const [serial] of ready) {
  console.log(`Installing app-release.apk (${sizeMb} MB) on ${serial}…`);
  execFileSync(adb, ['-s', serial, 'install', '-r', apk], { stdio: 'inherit' });
}
console.log('Done. Open "ETS2 Controller" on the phone.');
