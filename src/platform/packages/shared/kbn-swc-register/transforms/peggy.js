/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Peggy = require('@kbn/peggy');

/** @type {import('./types').Transform} */
const peggyTransform = (path, source, cache) => {
  const key = cache?.getKey(path, source);
  if (cache && key) {
    const cached = cache.getCode(key);
    if (cached !== undefined) {
      return cached;
    }
  }

  const config = Peggy.findConfigFile(path);

  const code = Peggy.getJsSourceSync({
    content: source,
    path,
    format: 'commonjs',
    optimize: 'speed',
    config,
    skipConfigSearch: true,
  }).source;

  if (cache && key) {
    cache.update(key, {
      code,
    });
  }

  return code;
};

module.exports = { peggyTransform };
