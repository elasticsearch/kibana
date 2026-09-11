/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Path = require('path');

/**
 * @param {string} path
 * @returns {import('@swc/core').ParserConfig}
 */
function getNodeRegisterParserConfig(path) {
  const ext = Path.extname(path);

  if (ext === '.js') {
    return {
      syntax: 'ecmascript',
      jsx: true,
      decorators: true,
    };
  }

  return {
    syntax: 'typescript',
    tsx: ext === '.tsx',
    decorators: true,
  };
}

/**
 * @param {string} path
 * @param {{ inlineSourceMaps?: boolean, inlineSourcesContent?: boolean }} options
 */
function getNodeRegisterSwcConfig(path, options = {}) {
  const { inlineSourceMaps = false, inlineSourcesContent = true } = options;
  const reactTransform =
    Path.extname(path) === '.ts'
      ? {}
      : /** @type {const} */ ({
          react: {
            runtime: 'automatic',
            development: process.env.NODE_ENV !== 'production',
            importSource: '@emotion/react',
          },
        });

  return /** @type {const} */ ({
    filename: path,
    swcrc: false,
    configFile: false,
    sourceMaps: inlineSourceMaps ? 'inline' : true,
    inlineSourcesContent,
    jsc: {
      parser: getNodeRegisterParserConfig(path),
      target: 'es2022',
      keepClassNames: true,
      externalHelpers: true,
      transform: {
        legacyDecorator: true,
        decoratorMetadata: true,
        ...reactTransform,
      },
    },
    module: {
      type: 'commonjs',
    },
  });
}

module.exports = { getNodeRegisterParserConfig, getNodeRegisterSwcConfig };
