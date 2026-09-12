/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// CommonJS so Node's native .ts loader doesn't load this file in ES module
// scope (which would break the require.resolve below).

const babelJest = require('babel-jest');

module.exports = babelJest.createTransformer({
  presets: [
    [
      require.resolve('@kbn/babel-preset/node_preset'),
      {
        '@babel/preset-env': {
          // disable built-in filtering, which is more performant but strips the import of `regenerator-runtime` required by EUI
          useBuiltIns: false,
          corejs: false,
        },
      },
    ],
  ],
  plugins: ['@emotion'],
});
