/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Path from 'path';

import type { PackageInfo } from '@kbn/config';
import { fromRoot } from '@kbn/repo-info';
import UiSharedDepsNpm from '@kbn/ui-shared-deps-npm';
import { distDir as UiSharedDepsSrcDistDir } from '@kbn/ui-shared-deps-src';
import * as KbnMonaco from '@kbn/monaco/server';
import * as KbnVegaSandbox from '@kbn/vega-sandbox/server';
import type { IRouter } from '@kbn/core-http-server';
import type { UiPlugins } from '@kbn/core-plugins-base-server-internal';
import type { InternalStaticAssets } from '@kbn/core-http-server-internal';
import { FileHashCache } from './file_hash_cache';
import { registerRouteForBundle } from './bundles_route';

/**
 * Check if RSPack mode is enabled via environment variable
 */
function isRspackMode(): boolean {
  const v = process.env.KBN_USE_RSPACK;
  return v === 'true' || v === '1';
}

/**
 *  Creates the routes that serves files from `bundlesPath`.
 *
 *  @param {Object} options
 *  @property {Array<{id,path}>} options.npUiPluginPublicDirs array of ids and paths that should be served for new platform plugins
 *  @property {string} options.regularBundlesPath
 *  @property {string} options.basePublicPath
 *
 *  @return Array.of({Hapi.Route})
 */
export function registerBundleRoutes({
  router,
  uiPlugins,
  packageInfo,
  staticAssets,
}: {
  router: IRouter;
  uiPlugins: UiPlugins;
  packageInfo: PackageInfo;
  staticAssets: InternalStaticAssets;
}) {
  const { dist: isDist } = packageInfo;
  const useRspack = isRspackMode();

  // rather than calculate the fileHash on every request, we
  // provide a cache object to `resolveDynamicAssetResponse()` that
  // will store the most recently used hashes.
  const fileHashCache = new FileHashCache();

  // Shared deps bundles are always served - they're built by webpack
  // and used by both webpack and RSPack built plugins
  const sharedNpmDepsPath = '/bundles/kbn-ui-shared-deps-npm/';
  registerRouteForBundle(router, {
    publicPath: staticAssets.prependPublicUrl(sharedNpmDepsPath) + '/',
    routePath: staticAssets.prependServerPath(sharedNpmDepsPath) + '/',
    bundlesPath: UiSharedDepsNpm.distDir,
    fileHashCache,
    isDist,
  });
  const sharedDepsPath = '/bundles/kbn-ui-shared-deps-src/';
  registerRouteForBundle(router, {
    publicPath: staticAssets.prependPublicUrl(sharedDepsPath) + '/',
    routePath: staticAssets.prependServerPath(sharedDepsPath) + '/',
    bundlesPath: UiSharedDepsSrcDistDir,
    fileHashCache,
    isDist,
  });
  const monacoEditorPath = '/bundles/kbn-monaco/';
  registerRouteForBundle(router, {
    publicPath: staticAssets.prependPublicUrl(monacoEditorPath) + '/',
    routePath: staticAssets.prependServerPath(monacoEditorPath) + '/',
    bundlesPath: KbnMonaco.bundleDir,
    fileHashCache,
    isDist,
  });
  const vegaSandboxPath = '/bundles/kbn-vega-sandbox/';
  registerRouteForBundle(router, {
    publicPath: staticAssets.prependPublicUrl(vegaSandboxPath) + '/',
    routePath: staticAssets.prependServerPath(vegaSandboxPath) + '/',
    bundlesPath: KbnVegaSandbox.bundleDir,
    fileHashCache,
    isDist,
  });

  if (useRspack) {
    // RSPack mode: serve unified build bundles from central directory
    const rspackBundlesPath = '/bundles/';
    registerRouteForBundle(router, {
      publicPath: staticAssets.prependPublicUrl(rspackBundlesPath) + '/',
      routePath: staticAssets.prependServerPath(rspackBundlesPath) + '/',
      bundlesPath: fromRoot('target/public/bundles'),
      fileHashCache,
      isDist,
    });

    // External plugins live in the plugins/ directory and have standalone bundles
    // built by kbn-plugin-helpers. Only check that directory — internal plugins are
    // compiled into kibana.bundle.js and their directories may contain leftover
    // webpack bundles that must not be loaded separately.
    const externalPluginsDir = fromRoot('plugins') + Path.sep;
    [...uiPlugins.internal.entries()].forEach(([id, { publicTargetDir, version }]) => {
      if (!publicTargetDir.startsWith(externalPluginsDir)) {
        return;
      }
      const standaloneBundle = Path.join(publicTargetDir, `${id}.plugin.js`);
      if (Fs.existsSync(standaloneBundle)) {
        const pluginBundlesPath = `/bundles/plugin/${id}/${version}/`;
        registerRouteForBundle(router, {
          publicPath: staticAssets.prependPublicUrl(pluginBundlesPath) + '/',
          routePath: staticAssets.prependServerPath(pluginBundlesPath) + '/',
          bundlesPath: publicTargetDir,
          fileHashCache,
          isDist,
        });
      }
    });
  } else {
    // Legacy webpack mode: serve from individual plugin directories

    // Core bundle
    const coreBundlePath = '/bundles/core/';
    registerRouteForBundle(router, {
      publicPath: staticAssets.prependPublicUrl(coreBundlePath) + '/',
      routePath: staticAssets.prependServerPath(coreBundlePath) + '/',
      bundlesPath: isDist
        ? fromRoot('node_modules/@kbn/core/target/public')
        : fromRoot('src/core/target/public'),
      fileHashCache,
      isDist,
    });

    // Plugin bundles from their individual directories
    [...uiPlugins.internal.entries()].forEach(([id, { publicTargetDir, version }]) => {
      const pluginBundlesPath = `/bundles/plugin/${id}/${version}/`;
      registerRouteForBundle(router, {
        publicPath: staticAssets.prependPublicUrl(pluginBundlesPath) + '/',
        routePath: staticAssets.prependServerPath(pluginBundlesPath) + '/',
        bundlesPath: publicTargetDir,
        fileHashCache,
        isDist,
      });
    });
  }
}
