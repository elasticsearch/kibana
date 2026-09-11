/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { snakeCase } from 'lodash';
import type { PluginPackageManifest } from '@kbn/repo-packages';
import type { PluginManifest } from '@kbn/core-plugins-server';
import { PluginType } from '@kbn/core-base-common';

export function pluginManifestFromPluginPackage(
  kibanaVersion: string,
  manifest: PluginPackageManifest
): PluginManifest {
  return {
    type: manifest.plugin.type === 'preboot' ? PluginType.preboot : PluginType.standard,
    id: manifest.plugin.id,
    version: '1.0.0',
    enabledOnAnonymousPages: manifest.plugin.enabledOnAnonymousPages,
    enableLazyInitialize: manifest.plugin.enableLazyInitialize,
    serviceFolders: manifest.serviceFolders,
    kibanaVersion,
    optionalPlugins: manifest.plugin.optionalPlugins ?? [],
    requiredBundles: manifest.plugin.requiredBundles ?? [],
    requiredPlugins: manifest.plugin.requiredPlugins ?? [],
    runtimePluginDependencies: manifest.plugin.runtimePluginDependencies ?? [],
    owner: {
      name: manifest.owner.join(' & '),
    },
    server: manifest.plugin.server,
    ui: manifest.plugin.browser,
    configPath: manifest.plugin.configPath ?? snakeCase(manifest.plugin.id),
  };
}
