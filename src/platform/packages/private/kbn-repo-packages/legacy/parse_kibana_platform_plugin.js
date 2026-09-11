/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const Path = require('path');

const { loadJsonFile } = require('./load_json_file');

/**
 * @param {unknown} input
 * @param {string} type
 * @returns {string[]}
 */
function isValidDepsDeclaration(input, type) {
  if (typeof input === 'undefined') return [];
  if (Array.isArray(input) && input.every((i) => typeof i === 'string')) {
    return input;
  }
  throw new TypeError(`The "${type}" in plugin manifest should be an array of strings.`);
}

/**
 * @param {string} manifestPath
 * @returns {import('./types').LegacyKibanaPlatformPlugin}
 */
function parseLegacyKibanaPlatformPlugin(manifestPath) {
  if (!Path.isAbsolute(manifestPath)) {
    throw new TypeError('expected new platform manifest path to be absolute');
  }

  /** @type {Partial<import('./types').LegacyKibanaPlatformPluginManifest>} */
  const manifest = loadJsonFile(manifestPath);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('expected new platform plugin manifest to be a JSON encoded object');
  }

  if (typeof manifest.id !== 'string') {
    throw new TypeError('expected new platform plugin manifest to have a string id');
  }

  if (typeof manifest.version !== 'string') {
    throw new TypeError('expected new platform plugin manifest to have a string version');
  }

  if (!manifest.owner || typeof manifest.owner.name !== 'string') {
    throw new TypeError(
      `Expected plugin ${manifest.id} manifest to have an owner with name specified (${manifestPath})`
    );
  }

  return {
    directory: Path.dirname(manifestPath),
    manifestPath,
    manifest: {
      ...manifest,

      ui: !!manifest.ui,
      server: !!manifest.server,
      id: manifest.id,
      version: manifest.version,
      kibanaVersion: manifest.kibanaVersion || manifest.version,
      serviceFolders: manifest.serviceFolders || [],
      owner: manifest.owner,
      description: manifest.description,
      enabledOnAnonymousPages: Boolean(manifest.enabledOnAnonymousPages),
      enableLazyInitialize: Boolean(manifest.enableLazyInitialize),
      requiredPlugins: isValidDepsDeclaration(manifest.requiredPlugins, 'requiredPlugins'),
      optionalPlugins: isValidDepsDeclaration(manifest.optionalPlugins, 'optionalPlugins'),
      requiredBundles: isValidDepsDeclaration(manifest.requiredBundles, 'requiredBundles'),
      extraPublicDirs: isValidDepsDeclaration(manifest.extraPublicDirs, 'extraPublicDirs'),
      runtimePluginDependencies: isValidDepsDeclaration(
        manifest.runtimePluginDependencies,
        'runtimePluginDependencies'
      ),
    },
  };
}

module.exports = {
  parseLegacyKibanaPlatformPlugin,
};
