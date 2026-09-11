/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

require('@kbn/swc-register').install();

const path = require('path');
const webpack = require('webpack');

const { CiStatsPlugin } = require('./webpack/ci_stats_plugin');
const {
  KIBANA_ROOT,
  SHAREABLE_RUNTIME_OUTPUT,
  LIBRARY_NAME,
  SHAREABLE_RUNTIME_NAME,
} = require('./constants');

const isProd = process.env.NODE_ENV === 'production';

/** @type {import('webpack').Configuration} */
module.exports = {
  context: KIBANA_ROOT,
  entry: {
    [SHAREABLE_RUNTIME_NAME]: require.resolve('./index.ts'),
  },
  target: 'web',
  mode: isProd ? 'production' : 'development',
  output: {
    path: SHAREABLE_RUNTIME_OUTPUT,
    filename: '[name].js',
    library: LIBRARY_NAME,
  },
  resolve: {
    alias: {
      core_app_image_assets: path.resolve(KIBANA_ROOT, 'src/core/public/styles/core_app/images'),
      [require.resolve('@elastic/eui/es/components/drag_and_drop')]: false,
    },
    extensions: ['.js', '.json', '.ts', '.tsx', '.scss'],
    mainFields: ['browser', 'module', 'main'],
    fallback: {
      fs: false,
      child_process: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          presets: [
            [
              require.resolve('@kbn/babel-preset/webpack_preset'),
              { useTransformRequireDefault: true },
            ],
          ],
        },
      },
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
            },
          },
        ],
        sideEffects: false,
      },
      {
        /**
         * further process the modules exported by both monaco-editor and monaco-yaml, because;
         * 1). they both use non-standard language APIs
         * 2). monaco-yaml exports it's src as is see, https://www.npmjs.com/package/monaco-yaml#does-it-work-without-a-bundler
         */
        test: /(monaco-editor\/esm\/vs\/|monaco-languageserver-types|monaco-marker-data-provider|monaco-worker-manager).*(t|j)sx?$/,
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            envName: isProd ? 'production' : 'development',
            presets: [require.resolve('@kbn/babel-preset/webpack_preset')],
            plugins: [require.resolve('@babel/plugin-transform-numeric-separator')],
          },
        },
      },
      {
        test: /\.css$/,
        exclude: /components/,
        use: [
          { loader: 'style-loader' },
          { loader: 'css-loader' },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                config: require.resolve('./postcss.config.js'),
              },
            },
          },
          {
            loader: 'string-replace-loader',
            options: {
              search: '__REPLACE_WITH_PUBLIC_PATH__',
              replace: '/',
              flags: 'g',
            },
          },
        ],
        sideEffects: true,
      },
      {
        test: /\.module\.s(a|c)ss$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: '[name]__[local]___[hash:base64:5]',
                exportLocalsConvention: 'camelCase',
              },
              sourceMap: !isProd,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                config: require.resolve('@kbn/optimizer/postcss.config'),
              },
            },
          },
          {
            loader: 'sass-loader',
            options: {
              implementation: require('sass-embedded'),
              sourceMap: !isProd,
            },
          },
        ],
      },
      {
        test: /\.scss$/,
        exclude: [/node_modules/, /\.module\.s(a|c)ss$/],
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
            options: {
              sourceMap: !isProd,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              sourceMap: !isProd,
              postcssOptions: {
                config: require.resolve('./postcss.config'),
              },
            },
          },
          {
            loader: 'sass-loader',
            options: {
              additionalData(content, loaderContext) {
                const req = JSON.stringify(
                  loaderContext.utils.contextify(
                    loaderContext.context || loaderContext.rootContext,
                    path.resolve(
                      KIBANA_ROOT,
                      'src/core/public/styles/core_app/_globals_v8light.scss'
                    )
                  )
                );
                return `@import ${req};\n${content}`;
              },
              implementation: require('sass-embedded'),
              sassOptions: {
                outputStyle: 'expanded',
                includePaths: [path.resolve(KIBANA_ROOT, 'node_modules')],
              },
            },
          },
        ],
      },
      {
        test: require.resolve('jquery'),
        use: [
          {
            loader: 'expose-loader',
            options: {
              exposes: ['jQuery', '$'],
            },
          },
        ],
      },
      {
        test: /\.(woff|woff2|ttf|eot|svg|ico|png|jpg|gif|jpeg)(\?|$)/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 8192,
          },
        },
        sideEffects: false,
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.peggy$/,
        use: require.resolve('@kbn/peggy-loader'),
      },
    ],
  },
  plugins: [
    isProd ? new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }) : [],
    new CiStatsPlugin({
      entryName: SHAREABLE_RUNTIME_NAME,
    }),
  ].flat(),
};
