/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Fs = require('fs');
const Path = require('path');
const Crypto = require('crypto');

const { version: swcVersion } = require('@swc/core/package.json');
const { version: peggyVersion } = require('peggy/package.json');

const { REPO_ROOT, UPSTREAM_BRANCH } = require('@kbn/repo-info');
const { getNodeRegisterSwcConfig } = require('@kbn/swc-config/node_register');

/**
 * @param {string} path
 */
function getCachePrefixSwcConfig(path) {
  const config = getNodeRegisterSwcConfig(path, {
    inlineSourceMaps: false,
    inlineSourcesContent: false,
  });

  return {
    swcrc: config.swcrc,
    configFile: config.configFile,
    sourceMaps: config.sourceMaps,
    inlineSourcesContent: config.inlineSourcesContent,
    jsc: config.jsc,
    module: config.module,
  };
}

function determineCachePrefix() {
  const json = JSON.stringify({
    cacheVersion: 1,
    swcVersion,
    peggyVersion,
    js: getCachePrefixSwcConfig('foo.js'),
    ts: getCachePrefixSwcConfig('foo.ts'),
    tsx: getCachePrefixSwcConfig('foo.tsx'),
  });

  return Crypto.hash('sha256', json, 'hex').slice(0, 10);
}

/** @type {boolean} */
let lmdbDisabledLogged = false;
/** @type {string | undefined} */
let lmdbDisabledReason;

function lmdbAvailable() {
  try {
    if (process.env.CODEX_SANDBOX) {
      lmdbDisabledReason = 'CODEX_SANDBOX is set';
      return false;
    }

    require('lmdb');
    return true;
  } catch {
    lmdbDisabledReason = 'LMDB module unavailable';
    return false;
  }
}

/**
 * @param {string | undefined} reason
 */
function logLmdbDisabledOnce(reason) {
  if (lmdbDisabledLogged) {
    return;
  }

  lmdbDisabledLogged = true;
  const detail = reason ? ` (${reason})` : '';
  console.warn(`LMDB cache disabled for @kbn/swc-register${detail}`);
}

/**
 * @returns {import('./types').Cache | undefined}
 */
function getCache() {
  const prefix = determineCachePrefix();
  const log = process.env.DEBUG_SWC_REGISTER_CACHE
    ? Fs.createWriteStream('swc_register_cache.log', { flags: 'a' })
    : undefined;

  if (process.env.DISABLE_SWC_REGISTER_CACHE) {
    log?.end('lmdb cache is disabled\n');
    return undefined;
  }

  if (lmdbAvailable()) {
    log?.write('lmdb is available, using lmdb cache\n');
    return new (require('./lmdb_cache').LmdbCache)({
      dir: Path.resolve(REPO_ROOT, 'data/swc_register_cache', UPSTREAM_BRANCH),
      prefix,
      log,
    });
  }

  log?.end('lmdb is unavailable, disabling cache\n');
  logLmdbDisabledOnce(lmdbDisabledReason);
  return undefined;
}

module.exports = {
  getCache,
  determineCachePrefix,
};
