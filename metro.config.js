// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The Windows companion lives in ./companion with its own node_modules; keep it out of the app bundle.
const escaped = path.join(__dirname, 'companion').replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [new RegExp(`^${escaped}[/\\\\].*`)];

module.exports = config;
