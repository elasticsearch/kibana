/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Inspired in a discussion found at https://github.com/facebook/jest/issues/5356 as Jest currently doesn't
// offer any other option to preserve symlinks.
//
// It would be available once https://github.com/facebook/jest/pull/9976 got merged.

const Path = require('path');
const resolve = require('resolve');
const { REPO_ROOT } = require('@kbn/repo-info');
const { readPackageMap } = require('@kbn/repo-packages');

const pkgMap = readPackageMap();

const APM_AGENT_MOCK = Path.resolve(__dirname, 'mocks/apm_agent_mock.ts');
const CSS_MODULE_MOCK = Path.resolve(__dirname, 'mocks/css_module_mock.js');
const STYLE_MOCK = Path.resolve(__dirname, 'mocks/style_mock.js');
const FILE_MOCK = Path.resolve(__dirname, 'mocks/file_mock.js');
const WORKER_MOCK = Path.resolve(__dirname, 'mocks/worker_module_mock.js');

const STATIC_FILE_EXT =
  `jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga`
    .split('|')
    .map((e) => `.${e}`);

/**
 * @param {string} str
 * @returns
 */
function parseRequestOrExtSuffix(str) {
  const rawSuffix = '?raw';
  if (str.endsWith(rawSuffix)) {
    return str.slice(0, -rawSuffix.length);
  }
  return str;
}

/**
 * @param {string} request
 * @param {import('resolve').SyncOpts} options
 * @returns
 */
module.exports = (request, options) => {
  if (request === `@elastic/eui`) {
    return module.exports(`@elastic/eui/test-env`, options);
  }

  if (request.startsWith('@elastic/eui/lib/')) {
    return module.exports(request.replace('@elastic/eui/lib/', '@elastic/eui/test-env/'), options);
  }

  if (request === 'axios') {
    return resolve.sync('axios/dist/node/axios.cjs', {
      basedir: options.basedir,
      extensions: options.extensions,
    });
  }

  if (request === '@launchdarkly/js-sdk-common') {
    return resolve.sync('@launchdarkly/js-sdk-common/dist/cjs/index.cjs', {
      basedir: options.basedir,
      extensions: options.extensions,
    });
  }

  if (request === 'ts-api-utils') {
    return resolve.sync('ts-api-utils/lib/index.cjs', {
      basedir: options.basedir,
      extensions: options.extensions,
    });
  }

  if (request === 'zod' || request === 'zod/v4') {
    return resolve.sync('zod/v4/index.cjs', {
      basedir: options.basedir,
      extensions: options.extensions,
    });
  }

  if (request === 'just-bash') {
    return resolve.sync('just-bash/dist/bundle/index.cjs', {
      basedir: options.basedir,
      extensions: options.extensions,
    });
  }

  if (request === `elastic-apm-node`) {
    return APM_AGENT_MOCK;
  }

  const reqExt = Path.extname(request);
  if (reqExt) {
    const pRequest = parseRequestOrExtSuffix(request);
    const pReqExt = parseRequestOrExtSuffix(reqExt);
    const reqBasename = Path.basename(pRequest, pReqExt);
    if ((pReqExt === '.css' || pReqExt === '.scss') && reqBasename.endsWith('.module')) {
      return CSS_MODULE_MOCK;
    }

    if (pReqExt === '.css' || pReqExt === '.less' || pReqExt === '.scss') {
      return STYLE_MOCK;
    }

    if (STATIC_FILE_EXT.includes(pReqExt)) {
      return FILE_MOCK;
    }

    if (pReqExt === '.worker' && reqBasename.endsWith('.editor')) {
      return WORKER_MOCK;
    }
  }

  if (request.endsWith('?asUrl')) {
    return FILE_MOCK;
  }

  if (request.startsWith('@kbn/')) {
    const [, id, ...sub] = request.split('/');
    const pkgDir = pkgMap.get(`@kbn/${id}`);
    if (!pkgDir) {
      throw new Error(
        `unable to resolve pkg import, pkg '@kbn/${id}' is not in the pkg map. Do you need to bootstrap?`
      );
    }

    return resolve.sync(`./${pkgDir}${sub.length ? `/${sub.join('/')}` : ''}`, {
      basedir: REPO_ROOT,
      extensions: options.extensions,
    });
  }

  try {
    return resolve.sync(request, {
      basedir: options.basedir,
      extensions: options.extensions,
    });
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return options.defaultResolver(request, options);
    }

    throw error;
  }
};
