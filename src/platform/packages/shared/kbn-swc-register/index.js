/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable @kbn/eslint/require-license-header */

/**
 * This module is based on @babel/register @ 9808d25, modified to use
 * a more efficient caching implementation which writes to disk as
 * the cache is built rather than keeping the whole cache in memory
 * and then dumping it to disk when the process exits.
 */

/**
 * @notice
 * MIT License
 *
 * Copyright (c) 2014-present Sebastian McKenzie and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

const Fs = require('fs');
const Path = require('path');

const { addHook } = require('pirates');
const sourceMapSupport = require('source-map-support');

const { getCache } = require('./cache');
const { TRANSFORMS } = require('./transforms');

/** @typedef {RegExp | string} Matcher */

/** @type {Matcher[]} */
const IGNORE_PATTERNS = [
  // ignore paths matching `/node_modules/{a}`, unless `a` is "@kbn"
  /[\/\\]node_modules[\/\\](?!@kbn)([^\/\\]+)[\/\\]/,

  // ignore packages with "babel" in their names
  /[\/\\]packages[\/\\]([^\/\\]+-)?babel(-[^\/\\]+)?[\/\\]/,
  // ignore babel plugins
  /lazy_babel_plugin\.js$/,

  // ignore paths matching `/canvas/canvas_plugin/`
  /[\/\\]canvas[\/\\]canvas_plugin[\/\\]/,

  /[\\/]+kbn-swc-register[\\/]+/,
];

/**
 * @param {string} path
 * @param {Matcher[] | undefined} matchers
 */
function match(path, matchers) {
  if (!matchers) {
    return false;
  }

  return matchers.some((m) => {
    if (typeof m === 'string') {
      if (m.endsWith('/')) {
        return path.startsWith(m);
      }

      return path === m || path.startsWith(m + Path.sep);
    }

    return m.test(path);
  });
}

let installed = false;

/**
 * @param {{ ignore?: Matcher[], only?: Matcher[] } | undefined} options
 */
function install(options = undefined) {
  if (installed) {
    return;
  }

  installed = true;
  const cache = getCache();

  sourceMapSupport.install({
    handleUncaughtExceptions: false,
    environment: 'node',
    // @ts-expect-error bad source-map-support types
    retrieveSourceMap(path) {
      if (!cache) {
        return null;
      }

      if (!Path.isAbsolute(path)) {
        return null;
      }

      let source;
      try {
        source = Fs.readFileSync(path, 'utf8');
      } catch {
        return null;
      }

      const map = cache.getSourceMap(cache.getKey(path, source));
      return map ? { map, url: null } : null;
    },
  });

  const ignorePatterns = options?.ignore
    ? [...options.ignore, ...IGNORE_PATTERNS]
    : IGNORE_PATTERNS;

  addHook(
    (code, path) => {
      const ext = Path.extname(path);
      const transform = (Object.hasOwn(TRANSFORMS, ext) && TRANSFORMS[ext]) || TRANSFORMS.default;
      return transform(path, code, cache);
    },
    {
      exts: ['.js', '.ts', '.tsx', '.text', '.peggy', '.yaml', '.yml'],
      ignoreNodeModules: false,
      matcher(path) {
        if (options?.only && !match(path, options.only)) {
          return false;
        }

        return !match(path, ignorePatterns);
      },
    }
  );
}

module.exports = { install };
