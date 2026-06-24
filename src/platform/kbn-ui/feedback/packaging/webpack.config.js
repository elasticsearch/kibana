/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const entry = require.resolve('./react/index.tsx');
const outputPath = process.env.BUILD_OUTPUT_DIR || path.resolve(__dirname, '../target');
const mode = process.env.NODE_ENV || 'production';

module.exports = {
  mode,
  entry,
  context: path.dirname(entry),
  devtool: 'source-map',

  output: {
    libraryTarget: 'commonjs',
    path: outputPath,
    filename: 'index.js',
    publicPath: 'auto',
  },

  target: 'web',

  // Externalize peer dependencies.
  externals: {
    '@elastic/eui': 'commonjs @elastic/eui',
    '@emotion/react': 'commonjs @emotion/react',
    react: 'commonjs react',
    'react-dom': 'commonjs react-dom',
  },

  module: {
    rules: [
      {
        test: /\.(js|tsx?)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            envName: mode,
            presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
          },
        },
      },
    ],
  },

  resolve: {
    extensions: ['.js', '.ts', '.tsx'],

    // Redirect @kbn/* imports to local stubs so the source files can be
    // bundled without any Kibana-specific packages installed at runtime.
    alias: {
      '@kbn/i18n$': path.resolve(__dirname, 'react/services/i18n.tsx'),
      '@kbn/i18n/react': path.resolve(__dirname, 'react/services/i18n.tsx'),
      '@kbn/i18n-react': path.resolve(__dirname, 'react/services/i18n.tsx'),
    },
  },

  optimization: {
    minimize: mode === 'production',
    noEmitOnErrors: true,
  },

  plugins: [
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: ['**/*'],
      dangerouslyAllowCleanPatternsOutsideProject: true,
    }),
  ],
};
