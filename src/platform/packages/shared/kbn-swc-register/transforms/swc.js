/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const { getNodeRegisterSwcConfig } = require('@kbn/swc-config/node_register');

function getTransformSync() {
  return require('@swc/core').transformSync;
}

/**
 * @param {string | undefined} map
 * @returns {object | undefined}
 */
function parseSourceMap(map) {
  return map ? JSON.parse(map) : undefined;
}

/** @type {import('./types').Transform} */
const swcTransform = (path, source, cache) => {
  const key = cache?.getKey(path, source);
  if (cache && key) {
    const cached = cache.getCode(key);
    if (cached !== undefined) {
      return cached;
    }
  }

  const result = getTransformSync()(
    source,
    getNodeRegisterSwcConfig(path, {
      inlineSourceMaps: !cache,
      inlineSourcesContent: !cache,
    })
  );

  if (!result.code) {
    throw new Error(`swc failed to transpile [${path}]`);
  }

  if (cache && key) {
    cache.update(key, {
      code: result.code,
      map: parseSourceMap(result.map),
    });
  }

  return result.code;
};

module.exports = { swcTransform, parseSourceMap };
