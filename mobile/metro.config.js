// @bonamind/core is linked from ../packages/core (file: dependency). Metro
// must watch it, and its shared runtime deps must resolve from this app's
// node_modules so the bundle carries exactly one copy of each.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const coreDir = path.resolve(__dirname, '../packages/core');
config.watchFolders = [...(config.watchFolders ?? []), coreDir];
// Babel-injected helpers (@babel/runtime) in core's files resolve from the app.
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.resolve(__dirname, 'node_modules')];

const SHARED = new Set(['ts-fsrs', '@supabase/supabase-js']);
const appOrigin = path.join(__dirname, 'package.json');
config.resolver.resolveRequest = (context, moduleName, platform) =>
  SHARED.has(moduleName)
    ? context.resolveRequest({ ...context, originModulePath: appOrigin }, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);

// expo-sqlite on web (alpha; docs /versions/v57.0.0/sdk/sqlite/): the SQL
// worker loads a .wasm asset and needs SharedArrayBuffer, which browsers only
// expose to cross-origin-isolated documents.
config.resolver.assetExts.push('wasm');
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    middleware(req, res, next);
  },
};

module.exports = config;
