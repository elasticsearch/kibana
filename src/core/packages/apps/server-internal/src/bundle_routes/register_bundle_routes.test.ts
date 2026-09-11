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

import { fromRoot } from '@kbn/repo-info';

import { registerRouteForBundleMock } from './register_bundle_routes.test.mocks';

import type { PackageInfo } from '@kbn/config';
import { httpServiceMock } from '@kbn/core-http-server-mocks';
import type { InternalPluginInfo, UiPlugins } from '@kbn/core-plugins-base-server-internal';
import { registerBundleRoutes } from './register_bundle_routes';
import { FileHashCache } from './file_hash_cache';
import type { BasePath } from '@kbn/core-http-server-internal';
import { StaticAssets } from '@kbn/core-http-server-internal';

const createPackageInfo = (parts: Partial<PackageInfo> = {}): PackageInfo => ({
  buildNum: 42,
  buildSha: 'shasha',
  buildShaShort: 'sha',
  dist: true,
  branch: 'master',
  version: '8.0.0',
  buildDate: new Date('2023-05-15T23:12:09.000Z'),
  buildFlavor: 'traditional',
  ...parts,
});

const createUiPlugins = (...ids: string[]): UiPlugins => ({
  browserConfigs: new Map(),
  public: new Map(),
  internal: ids.reduce((map, id) => {
    map.set(id, {
      publicTargetDir: `/plugins/${id}/public-target-dir`,
      publicAssetsDir: `/plugins/${id}/public-assets-dir`,
      version: '8.0.0',
      requiredBundles: [],
    });
    return map;
  }, new Map<string, InternalPluginInfo>()),
});

const createExternalPluginsUiPlugins = (...ids: string[]): UiPlugins => ({
  browserConfigs: new Map(),
  public: new Map(),
  internal: ids.reduce((map, id) => {
    map.set(id, {
      publicTargetDir: Path.join(fromRoot('plugins'), id, 'target'),
      publicAssetsDir: Path.join(fromRoot('plugins'), id, 'assets'),
      version: '8.0.0',
      requiredBundles: [],
    });
    return map;
  }, new Map<string, InternalPluginInfo>()),
});

describe('registerBundleRoutes', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;
  let staticAssets: StaticAssets;
  let kbnUseRspackBeforeEach: string | undefined;

  beforeEach(() => {
    kbnUseRspackBeforeEach = process.env.KBN_USE_RSPACK;
    delete process.env.KBN_USE_RSPACK;

    router = httpServiceMock.createRouter();
    const basePath = httpServiceMock.createBasePath('/server-base-path') as unknown as BasePath;
    staticAssets = new StaticAssets({ basePath, cdnConfig: {} as any, shaDigest: 'sha' });
  });

  afterEach(() => {
    if (kbnUseRspackBeforeEach === undefined) {
      delete process.env.KBN_USE_RSPACK;
    } else {
      process.env.KBN_USE_RSPACK = kbnUseRspackBeforeEach;
    }
    registerRouteForBundleMock.mockReset();
  });

  it('registers core and shared-dep bundles', () => {
    registerBundleRoutes({
      router,
      staticAssets,
      packageInfo: createPackageInfo(),
      uiPlugins: createUiPlugins(),
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledTimes(5);

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: 'uiSharedDepsNpmDistDir',
      publicPath: '/server-base-path/sha/bundles/kbn-ui-shared-deps-npm/',
      routePath: '/sha/bundles/kbn-ui-shared-deps-npm/',
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: 'uiSharedDepsSrcDistDir',
      publicPath: '/server-base-path/sha/bundles/kbn-ui-shared-deps-src/',
      routePath: '/sha/bundles/kbn-ui-shared-deps-src/',
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: 'kbnMonacoBundleDir',
      publicPath: '/server-base-path/sha/bundles/kbn-monaco/',
      routePath: '/sha/bundles/kbn-monaco/',
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: 'kbnVegaSandboxBundleDir',
      publicPath: '/server-base-path/sha/bundles/kbn-vega-sandbox/',
      routePath: '/sha/bundles/kbn-vega-sandbox/',
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: expect.stringMatching(/\/@kbn\/core\/target\/public$/),
      publicPath: '/server-base-path/sha/bundles/core/',
      routePath: '/sha/bundles/core/',
    });
  });

  it('registers plugin bundles', () => {
    registerBundleRoutes({
      router,
      staticAssets,
      packageInfo: createPackageInfo(),
      uiPlugins: createUiPlugins('plugin-a', 'plugin-b'),
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledTimes(7);

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: '/plugins/plugin-a/public-target-dir',
      publicPath: '/server-base-path/sha/bundles/plugin/plugin-a/8.0.0/',
      routePath: '/sha/bundles/plugin/plugin-a/8.0.0/',
    });

    expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
      fileHashCache: expect.any(FileHashCache),
      isDist: true,
      bundlesPath: '/plugins/plugin-b/public-target-dir',
      publicPath: '/server-base-path/sha/bundles/plugin/plugin-b/8.0.0/',
      routePath: '/sha/bundles/plugin/plugin-b/8.0.0/',
    });
  });

  describe('rspack mode', () => {
    describe('when KBN_USE_RSPACK is enabled', () => {
      let kbnUseRspackPrevious: string | undefined;

      beforeEach(() => {
        kbnUseRspackPrevious = process.env.KBN_USE_RSPACK;
        process.env.KBN_USE_RSPACK = 'true';
      });

      afterEach(() => {
        if (kbnUseRspackPrevious === undefined) {
          delete process.env.KBN_USE_RSPACK;
        } else {
          process.env.KBN_USE_RSPACK = kbnUseRspackPrevious;
        }
        jest.restoreAllMocks();
        registerRouteForBundleMock.mockReset();
      });

      it('registers unified /bundles/ route instead of the legacy core bundle route', () => {
        registerBundleRoutes({
          router,
          staticAssets,
          packageInfo: createPackageInfo(),
          uiPlugins: createUiPlugins(),
        });

        expect(registerRouteForBundleMock).toHaveBeenCalledTimes(5);

        expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
          fileHashCache: expect.any(FileHashCache),
          isDist: true,
          bundlesPath: fromRoot('target/public/bundles'),
          publicPath: '/server-base-path/sha/bundles/',
          routePath: '/sha/bundles/',
        });

        expect(registerRouteForBundleMock).not.toHaveBeenCalledWith(
          router,
          expect.objectContaining({
            routePath: '/sha/bundles/core/',
          })
        );
      });

      it('registers external plugin bundle route only when standalone bundle exists on disk', () => {
        jest.spyOn(Fs, 'existsSync').mockReturnValue(false);

        registerBundleRoutes({
          router,
          staticAssets,
          packageInfo: createPackageInfo(),
          uiPlugins: createExternalPluginsUiPlugins('ext-plugin'),
        });

        expect(registerRouteForBundleMock).toHaveBeenCalledTimes(5);
        expect(registerRouteForBundleMock).not.toHaveBeenCalledWith(
          router,
          expect.objectContaining({
            routePath: '/sha/bundles/plugin/ext-plugin/8.0.0/',
          })
        );

        registerRouteForBundleMock.mockClear();
        jest.restoreAllMocks();

        jest.spyOn(Fs, 'existsSync').mockReturnValue(true);

        registerBundleRoutes({
          router,
          staticAssets,
          packageInfo: createPackageInfo(),
          uiPlugins: createExternalPluginsUiPlugins('ext-plugin'),
        });

        expect(registerRouteForBundleMock).toHaveBeenCalledTimes(6);
        expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
          fileHashCache: expect.any(FileHashCache),
          isDist: true,
          bundlesPath: Path.join(fromRoot('plugins'), 'ext-plugin', 'target'),
          publicPath: '/server-base-path/sha/bundles/plugin/ext-plugin/8.0.0/',
          routePath: '/sha/bundles/plugin/ext-plugin/8.0.0/',
        });
      });
    });

    it('when KBN_USE_RSPACK is unset, registers legacy core and per-plugin bundle routes', () => {
      const previous = process.env.KBN_USE_RSPACK;
      try {
        delete process.env.KBN_USE_RSPACK;

        registerBundleRoutes({
          router,
          staticAssets,
          packageInfo: createPackageInfo(),
          uiPlugins: createUiPlugins('plugin-a', 'plugin-b'),
        });

        expect(registerRouteForBundleMock).toHaveBeenCalledTimes(7);

        expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
          fileHashCache: expect.any(FileHashCache),
          isDist: true,
          bundlesPath: expect.stringMatching(/\/@kbn\/core\/target\/public$/),
          publicPath: '/server-base-path/sha/bundles/core/',
          routePath: '/sha/bundles/core/',
        });

        expect(registerRouteForBundleMock).toHaveBeenCalledWith(router, {
          fileHashCache: expect.any(FileHashCache),
          isDist: true,
          bundlesPath: '/plugins/plugin-a/public-target-dir',
          publicPath: '/server-base-path/sha/bundles/plugin/plugin-a/8.0.0/',
          routePath: '/sha/bundles/plugin/plugin-a/8.0.0/',
        });

        expect(registerRouteForBundleMock).not.toHaveBeenCalledWith(
          router,
          expect.objectContaining({
            bundlesPath: fromRoot('target/public/bundles'),
          })
        );
      } finally {
        if (previous === undefined) {
          delete process.env.KBN_USE_RSPACK;
        } else {
          process.env.KBN_USE_RSPACK = previous;
        }
      }
    });
  });
});
