/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const { getNodeRegisterSwcConfig } = require('./node_register');

/**
 * @param {string} path
 * @returns {import('@swc/core').Options}
 */
function getJestSwcConfig(path) {
  const config = getNodeRegisterSwcConfig(path);

  return {
    ...config,
    jsc: {
      ...config.jsc,
      // Keep helpers which define exports in the transformed module so the Jest transformer
      // can make those properties configurable for spies and module mocks.
      externalHelpers: false,
      experimental: {
        plugins: [
          [
            require.resolve('@swc/plugin-emotion'),
            {
              sourceMap: false,
              autoLabel: 'always',
              labelFormat: '[local]',
            },
          ],
        ],
      },
    },
  };
}

module.exports = { getJestSwcConfig };
