/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Path = require('path');
const Fs = require('fs');
const Fsp = require('fs/promises');

const Peggy = require('peggy');

/**
 * @param {string} grammarPath
 * @returns {import('./types').Config | undefined}
 */
function findConfigFile(grammarPath) {
  const path = Path.resolve(Path.dirname(grammarPath), `${Path.basename(grammarPath)}.config.json`);

  let source;
  let parsed;
  try {
    source = Fs.readFileSync(path, 'utf8');
    parsed = JSON.parse(source);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }

  return { path, source, parsed };
}

/**
 *
 * @param {import('./types').Options} options
 * @returns {Promise<import('./types').Result>}
 */
async function getJsSource(options) {
  let source;
  if (options.content) {
    source = options.content;
  } else if (options.path) {
    source = await Fsp.readFile(options.path, 'utf8');
  } else {
    throw new Error('you must either specify the path of the grammar file, or the content');
  }

  return getJsSourceSync({
    content: source,
    ...options,
  });
}

/**
 * @param {import('./types').SyncOptions} options
 * @returns
 */
function getJsSourceSync(options) {
  const config =
    options.config ??
    (options.path && options.skipConfigSearch !== true ? findConfigFile(options.path) : null);

  const result = Peggy.generate(options.content, {
    ...config?.parsed,
    format: options.format === 'esm' ? 'es' : 'commonjs',
    optimize: options.optimize,
    output: 'source',
  });

  return {
    /**
     * The source code of the module which parses expressions in the format
     * defined by the peggy grammar file
     */
    source: /** @type {string} */ (/** @type {unknown} */ (result)),

    /**
     * The loaded config if it was found
     */
    config: config ?? null,
  };
}

/**
 * Registers a Node require hook for `.peggy` files.
 * Compiles grammars on-the-fly to CommonJS using `getJsSourceSync` and caches per file path.
 *
 * This is the runtime equivalent of:
 * - @kbn/peggy-loader (webpack)
 * - @kbn/test/transforms/peggy.js (jest)
 *
 * @param {{ force?: boolean }} [options]
 * When `force` is true the hook is (re)registered even if a `.peggy` handler is already
 * present. This is required under Playwright, where `@kbn/swc-register` installs a
 * `pirates`-based `.peggy` handler that reads the grammar file through Node's default `.js`
 * loader. On Node >=23.5, Playwright registers a synchronous `module.registerHooks` load hook,
 * so that default loader Babel-parses the raw grammar and throws "Missing semicolon". This
 * standalone handler compiles the grammar itself and calls `module._compile` directly, which
 * bypasses the load hook, so it must win over `@kbn/swc-register`'s chaining handler.
 */
function requireHook(options = {}) {
  const { force = false } = options;

  // Only register once, unless a caller explicitly needs to override an existing handler.
  if (require.extensions['.peggy'] && !force) {
    console.log('.peggy require hook already registered, skipping');
    return;
  }

  const cache = new Map();

  require.extensions['.peggy'] = function (module, filename) {
    let compiled = cache.get(filename);
    if (!compiled) {
      const content = Fs.readFileSync(filename, 'utf8');
      const { source } = getJsSourceSync({
        path: filename,
        content,
        format: 'commonjs',
        optimize: 'speed',
        skipConfigSearch: false,
      });
      compiled = source;
      cache.set(filename, compiled);
    }
    // @ts-expect-error - _compile is an internal Node.js API
    if (typeof module._compile !== 'function') {
      throw new Error(
        'Unable to compile .peggy file: module._compile is an internal Node.js API. ' +
          'Make sure you are running this code in a standard Node.js environment'
      );
    }
    // @ts-expect-error - _compile is an internal Node.js API
    module._compile(compiled, filename);
  };
}

module.exports = {
  findConfigFile,
  getJsSource,
  getJsSourceSync,
  requireHook,
  version: Peggy.VERSION,
};
