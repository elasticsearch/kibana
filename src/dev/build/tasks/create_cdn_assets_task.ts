/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import { access } from 'fs/promises';

import { basename, resolve, dirname } from 'path';
import { asyncForEach } from '@kbn/std';
import { Jsonc } from '@kbn/repo-packages';
import {
  discoverAllTranslationPaths,
  getKibanaTranslationFiles,
} from '@kbn/core-i18n-server-internal';
import { i18n, i18nLoader } from '@kbn/i18n';

import del from 'del';
import { globbySync } from 'globby';

import type { Task } from '../lib';
import { mkdirp, compressTar, copyAll, write } from '../lib';

export const CreateCdnAssets: Task = {
  description: 'Creating CDN assets',

  async run(config, log, build) {
    const buildSource = build.resolvePath();
    const buildSha = config.getBuildShaShort();
    const buildVersion = config.getBuildVersion();
    const assets = config.resolveFromRepo('build', 'cdn-assets');
    const bundles = resolve(assets, buildSha, 'bundles');

    await del(assets);
    await mkdirp(assets);

    const plugins = globbySync([`${buildSource}/node_modules/@kbn/**/*/kibana.jsonc`]);

    // translation files: discover every locale that any plugin or package
    // ships a translation file for, and bundle one CDN asset per locale.
    // This allows admins to enable plugin- or admin-supplied locales via
    // `i18n.locales` at runtime without rebuilding Kibana.
    const pluginPaths = plugins.map((plugin) => resolve(dirname(plugin)));
    const allTranslationPaths = await discoverAllTranslationPaths(pluginPaths);
    const discoveredLocales = Array.from(
      new Set(['en', ...allTranslationPaths.map((path) => basename(path, '.json'))])
    );
    for (const locale of discoveredLocales) {
      const translationFileContent = await generateTranslationFile(locale, pluginPaths);
      await write(
        resolve(assets, buildSha, `translations`, `${locale}.json`),
        translationFileContent
      );
    }

    // Plugins static assets
    await asyncForEach(plugins, async (path) => {
      const manifest = Jsonc.parse(readFileSync(path, 'utf8')) as any;
      if (manifest?.plugin?.id) {
        const pluginRoot = resolve(dirname(path));
        // src/core/packages/apps/server-internal/src/core_app.ts
        const assetsSource = resolve(pluginRoot, 'public', 'assets');
        const assetsDest = resolve(assets, buildSha, 'plugins', manifest.plugin.id, 'assets');
        try {
          await access(assetsSource);
          await mkdirp(assetsDest);
          await copyAll(assetsSource, assetsDest);
        } catch (e) {
          if (!(e.code === 'ENOENT' && e.syscall === 'access')) throw e;
        }

        try {
          // src/core/packages/apps/server-internal/src/bundle_routes/register_bundle_routes.ts
          const bundlesSource = resolve(pluginRoot, 'target', 'public');
          const bundlesDest = resolve(bundles, 'plugin', manifest.plugin.id, '1.0.0');
          await access(bundlesSource);
          await mkdirp(bundlesDest);
          await copyAll(bundlesSource, bundlesDest);
        } catch (e) {
          // bundles are optional
          if (!(e.code === 'ENOENT' && e.syscall === 'access')) throw e;
        }
      }
    });

    // src/core/packages/apps/server-internal/src/bundle_routes/register_bundle_routes.ts
    await copyAll(
      resolve(buildSource, 'node_modules/@kbn/ui-shared-deps-npm/shared_built_assets'),
      resolve(bundles, 'kbn-ui-shared-deps-npm')
    );
    await copyAll(
      resolve(buildSource, 'node_modules/@kbn/ui-shared-deps-src/shared_built_assets'),
      resolve(bundles, 'kbn-ui-shared-deps-src')
    );
    // [rspack-transition] When the legacy optimizer is removed, delete the else branch.
    if (process.env.KBN_USE_RSPACK === 'true' || process.env.KBN_USE_RSPACK === '1') {
      // Rspack: all bundles (core + plugins) are in the unified output directory.
      // Copy into the CDN bundles root so URLs like /bundles/kibana.bundle.js
      // and /bundles/chunks/<hash>.js resolve correctly.
      await copyAll(resolve(buildSource, 'target/public/bundles'), resolve(bundles));
    } else {
      await copyAll(
        resolve(buildSource, 'node_modules/@kbn/core/target/public'),
        resolve(bundles, 'core')
      );
    }
    await copyAll(
      resolve(buildSource, 'node_modules/@kbn/monaco/target_workers'),
      resolve(bundles, 'kbn-monaco')
    );
    await copyAll(
      resolve(buildSource, 'node_modules/@kbn/vega-sandbox/target_vega_sandbox'),
      resolve(bundles, 'kbn-vega-sandbox')
    );

    // src/core/packages/apps/server-internal/src/core_app.ts
    await copyAll(
      resolve(buildSource, 'node_modules/@kbn/core-apps-server-internal/assets'),
      resolve(assets, buildSha, 'ui')
    );
    await copyAll(
      resolve(buildSource, 'node_modules/@elastic/charts/dist'),
      resolve(assets, buildSha, 'ui', 'charts')
    );

    await compressTar({
      source: assets,
      destination: config.resolveFromTarget(`kibana-${buildVersion}-cdn-assets.tar.gz`),
      gzipLevel: 6,
      createRootDirectory: true,
      rootDirectoryName: `kibana-${buildVersion}-cdn-assets`,
    });
  },
};

async function generateTranslationFile(locale: string, pluginPaths: string[]) {
  const translationFiles = await getKibanaTranslationFiles(locale, pluginPaths);
  i18nLoader.registerTranslationFiles(translationFiles);
  const translations = await i18nLoader.getTranslationsByLocale(locale);
  i18n.init(translations);
  return JSON.stringify(i18n.getTranslation());
}
