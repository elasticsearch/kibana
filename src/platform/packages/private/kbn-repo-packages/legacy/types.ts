/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface LegacyKibanaPlatformPlugin {
  readonly directory: string;
  readonly manifestPath: string;
  readonly manifest: LegacyKibanaPlatformPluginManifest;
}

export interface LegacyKibanaPlatformPluginManifest {
  id: string;
  ui: boolean;
  server: boolean;
  kibanaVersion: string;
  version: string;
  owner: {
    // Internally, this should be a team name.
    name: string;
    // All internally owned plugins should have a github team specified that can be pinged in issues, or used to look up
    // members who can be asked questions regarding the plugin.
    githubTeam?: string;
  };
  // TODO: make required.
  description?: string;
  enabledOnAnonymousPages?: boolean;
  enableLazyInitialize?: boolean;
  serviceFolders: readonly string[];
  requiredPlugins: readonly string[];
  optionalPlugins: readonly string[];
  runtimePluginDependencies?: readonly string[];
  requiredBundles: readonly string[];
  extraPublicDirs: readonly string[];
}
