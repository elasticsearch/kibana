/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const { dotTextTransform } = require('./dot_text');
const { yamlTransform } = require('./yaml');
const { swcTransform } = require('./swc');

/** @type {import('./types').Transform} */
const peggyTransform = (path, source, cache) =>
  require('./peggy').peggyTransform(path, source, cache);

module.exports = {
  /**
   * @type {Record<string, import('./types').Transform>}
   */
  TRANSFORMS: {
    '.peggy': peggyTransform,
    '.text': dotTextTransform,
    '.yaml': yamlTransform,
    '.yml': yamlTransform,
    default: swcTransform,
  },
};
