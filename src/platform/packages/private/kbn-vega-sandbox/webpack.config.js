/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// @ts-check
const path = require('path');
const { NodeLibsBrowserPlugin } = require('@kbn/node-libs-browser-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = {
  // @ts-expect-error we are unable to type NODE_ENV
  mode: process.env.NODE_ENV || 'development',
  entry: {
    vega_sandbox: path.resolve(__dirname, 'src', 'bootstrap.ts'),
  },
  devtool: process.env.NODE_ENV === 'production' ? false : 'cheap-source-map',
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'target_vega_sandbox'),
    filename: '[name].bootstrap.js',
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  plugins: [new NodeLibsBrowserPlugin()],
  stats: 'errors-only',
  module: {
    rules: [
      {
        test: /\.(jsx?|tsx?)$/,
        exclude: /node_modules(?!\/@kbn\/)(\/[^\/]+\/)/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            envName: process.env.NODE_ENV || 'development',
            presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
          },
        },
      },
    ],
  },
};
