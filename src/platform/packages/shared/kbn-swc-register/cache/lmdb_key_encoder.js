/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * @param {string | Uint8Array} key
 * @param {Uint8Array} target
 * @param {number} start
 * @returns {number}
 */
const writeKey = (key, target, start) => {
  const encodedKey = typeof key === 'string' ? Buffer.from(key, 'utf8') : key;
  target.set(encodedKey, start);
  return start + encodedKey.length;
};

/**
 * @param {Uint8Array} source
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
const readKey = (source, start, end) => Buffer.from(source.subarray(start, end)).toString('utf8');

exports.utf8StringKeyEncoder = {
  writeKey,
  readKey,
};
