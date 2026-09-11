/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFile } from 'fs';
import { resolve } from 'path';
import { coerce } from 'semver';
import { snakeCase } from 'lodash';
import type { PackageInfo } from '@kbn/config';
import { isConfigPath } from '@kbn/config';
import { PluginType } from '@kbn/core-base-common';
import type { PluginManifest } from '@kbn/core-plugins-server';
import { promisify } from 'util';
import { PluginDiscoveryError } from './plugin_discovery_error';
import { isCamelCase } from './is_camel_case';

const fsReadFileAsync = promisify(readFile);
/**
 * Name of the JSON manifest file that should be located in the plugin directory.
 */
const MANIFEST_FILE_NAME = 'kibana.json';

/**
 * The special "kibana" version can be used by the plugins to be always compatible.
 */
const ALWAYS_COMPATIBLE_VERSION = 'kibana';

/**
 * Names of the known manifest fields.
 */
const KNOWN_MANIFEST_FIELDS = (() => {
  // We use this trick to have type safety around the keys we use, if we forget to
  // add a new key here or misspell existing one, TypeScript compiler will complain.
  // We do this once at run time, so performance impact is negligible.
  const manifestFields: { [P in keyof PluginManifest]: boolean } = {
    id: true,
    kibanaVersion: true,
    type: true,
    version: true,
    configPath: true,
    requiredPlugins: true,
    optionalPlugins: true,
    runtimePluginDependencies: true,
    ui: true,
    server: true,
    extraPublicDirs: true,
    requiredBundles: true,
    serviceFolders: true,
    owner: true,
    description: true,
    enabledOnAnonymousPages: true,
    enableLazyInitialize: true,
  };

  return new Set(Object.keys(manifestFields));
})();

/**
 * Tries to load and parse the plugin manifest file located at the provided plugin
 * directory path and produces an error result if it fails to do so or plugin manifest
 * isn't valid.
 * @param pluginPath Path to the plugin directory where manifest should be loaded from.
 * @param packageInfo Kibana package info.
 * @internal
 */
export async function parseManifest(
  pluginPath: string,
  packageInfo: PackageInfo
): Promise<PluginManifest> {
  const manifestPath = resolve(pluginPath, MANIFEST_FILE_NAME);

  let manifestContent;
  try {
    manifestContent = await fsReadFileAsync(manifestPath);
  } catch (err) {
    throw PluginDiscoveryError.missingManifest(manifestPath, err);
  }

  let manifest: Partial<PluginManifest>;
  try {
    manifest = JSON.parse(manifestContent.toString());
  } catch (err) {
    throw PluginDiscoveryError.invalidManifest(manifestPath, err);
  }

  if (!manifest || typeof manifest !== 'object') {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error('Plugin manifest must contain a JSON encoded object.')
    );
  }

  if (!manifest.id || typeof manifest.id !== 'string') {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error('Plugin manifest must contain an "id" property.')
    );
  }

  // Plugin id can be used as a config path or as a logger context and having dots
  // in there may lead to various issues, so we forbid that.
  if (manifest.id.includes('.')) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error('Plugin "id" must not include `.` characters.')
    );
  }

  if (!isCamelCase(manifest.id)) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(`Plugin "id" must be camelCase, but found: ${manifest.id}.`)
    );
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(`Plugin manifest for "${manifest.id}" must contain a "version" property.`)
    );
  }

  if (!manifest.owner || !manifest.owner.name || typeof manifest.owner.name !== 'string') {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(
        `Plugin manifest for "${manifest.id}" must contain an "owner" property, which includes a nested "name" property.`
      )
    );
  }

  if (manifest.configPath !== undefined && !isConfigPath(manifest.configPath)) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(
        `The "configPath" in plugin manifest for "${manifest.id}" should either be a string or an array of strings.`
      )
    );
  }

  if (
    manifest.extraPublicDirs &&
    (!Array.isArray(manifest.extraPublicDirs) ||
      !manifest.extraPublicDirs.every((dir) => typeof dir === 'string'))
  ) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(
        `The "extraPublicDirs" in plugin manifest for "${manifest.id}" should be an array of strings.`
      )
    );
  }

  const expectedKibanaVersion =
    typeof manifest.kibanaVersion === 'string' && manifest.kibanaVersion
      ? manifest.kibanaVersion
      : manifest.version;
  if (!isVersionCompatible(expectedKibanaVersion, packageInfo.version)) {
    throw PluginDiscoveryError.incompatibleVersion(
      manifestPath,
      new Error(
        `Plugin "${manifest.id}" is only compatible with Kibana version "${expectedKibanaVersion}", but used Kibana version is "${packageInfo.version}".`
      )
    );
  }

  const includesServerPlugin = typeof manifest.server === 'boolean' ? manifest.server : false;
  const includesUiPlugin = typeof manifest.ui === 'boolean' ? manifest.ui : false;
  if (!includesServerPlugin && !includesUiPlugin) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(
        `Both "server" and "ui" are missing or set to "false" in plugin manifest for "${manifest.id}", but at least one of these must be set to "true".`
      )
    );
  }

  const unknownManifestKeys = Object.keys(manifest).filter(
    (key) => !KNOWN_MANIFEST_FIELDS.has(key)
  );
  if (unknownManifestKeys.length > 0) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(
        `Manifest for plugin "${manifest.id}" contains the following unrecognized properties: ${unknownManifestKeys}.`
      )
    );
  }

  const type = manifest.type ?? PluginType.standard;
  if (type !== PluginType.preboot && type !== PluginType.standard) {
    throw PluginDiscoveryError.invalidManifest(
      manifestPath,
      new Error(
        `The "type" in manifest for plugin "${manifest.id}" is set to "${type}", but it should either be "standard" or "preboot".`
      )
    );
  }

  return {
    id: manifest.id,
    version: manifest.version,
    kibanaVersion: expectedKibanaVersion,
    type,
    configPath: manifest.configPath || snakeCase(manifest.id),
    requiredPlugins: Array.isArray(manifest.requiredPlugins) ? manifest.requiredPlugins : [],
    optionalPlugins: Array.isArray(manifest.optionalPlugins) ? manifest.optionalPlugins : [],
    requiredBundles: Array.isArray(manifest.requiredBundles) ? manifest.requiredBundles : [],
    runtimePluginDependencies: Array.isArray(manifest.runtimePluginDependencies)
      ? manifest.runtimePluginDependencies
      : [],
    ui: includesUiPlugin,
    server: includesServerPlugin,
    extraPublicDirs: manifest.extraPublicDirs,
    owner: manifest.owner!,
    description: manifest.description,
    enabledOnAnonymousPages: manifest.enabledOnAnonymousPages,
    enableLazyInitialize: manifest.enableLazyInitialize,
  };
}

/**
 * Checks whether plugin expected Kibana version is compatible with the used Kibana version.
 * @param expectedKibanaVersion Kibana version expected by the plugin.
 * @param actualKibanaVersion Used Kibana version.
 */
function isVersionCompatible(expectedKibanaVersion: string, actualKibanaVersion: string) {
  if (expectedKibanaVersion === ALWAYS_COMPATIBLE_VERSION) {
    return true;
  }

  const coercedActualKibanaVersion = coerce(actualKibanaVersion);
  if (coercedActualKibanaVersion == null) {
    return false;
  }

  const coercedExpectedKibanaVersion = coerce(expectedKibanaVersion);
  if (coercedExpectedKibanaVersion == null) {
    return false;
  }

  // Compare coerced versions, e.g. `1.2.3` ---> `1.2.3` and `7.0.0-alpha1` ---> `7.0.0`.
  return coercedActualKibanaVersion.compare(coercedExpectedKibanaVersion) === 0;
}
