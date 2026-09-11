/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaGroup, ModuleVisibility } from '@kbn/projects-solutions-groups';
import type { Package } from './package';
import type { PLUGIN_CATEGORY } from './plugin_category_info';

type ExportTarget = string | ConditionalExports | Array<string | ConditionalExports>;

interface ConditionalExports {
  [condition: string]: ExportTarget;
}

interface SubpathExports {
  [subpath: string]: ExportTarget;
}

export type PackageExports = ExportTarget | SubpathExports | null;

export interface ParsedPackageJson {
  /** The name of the package, usually `@kbn/`+something */
  name: string;
  /** "dependenices" property from package.json */
  dependencies?: Record<string, string>;
  /** "devDependenices" property from package.json */
  devDependencies?: Record<string, string>;
  /** Some kibana specific properties about this package */
  kibana?: {
    /** Is this package only intended for dev? */
    devOnly?: boolean;
  };
  /** Scripts defined in the package.json file */
  scripts?: {
    [key: string]: string | undefined;
  };
  exports?: PackageExports;
  /** All other fields in the package.json are typed as unknown as we don't care what they are */
  [key: string]: unknown;
}

export type KibanaPackageType =
  | 'core'
  | 'plugin'
  | 'tooling'
  | 'shared-browser'
  | 'shared-server'
  | 'shared-common'
  | 'shared-scss'
  | 'functional-tests'
  | 'test-helper';

export interface PackageManifestBaseFields {
  /**
   * The type of this package. Package types define how a package can and should
   * be used/built. Some package types also change the way that packages are
   * interpreted.
   */
  type: KibanaPackageType;
  /**
   * Module ID for this package. This must be globbally unique amoungst all
   * packages and should include the most important information about how this
   * package should be used. Avoid generic names to aid in disambiguation.
   */
  id: string;
  /**
   * Github handles for the people or teams responsible for this package.
   * These values will be used in the codeowners files for this package.
   */
  owner: string[];
  /**
   * A devOnly package can be used by other devOnly packages (and only
   * other devOnly packages) and will never be included in the distributable
   */
  devOnly?: boolean;
  /**
   * configuration used to customize how this package is built
   */
  build?: {
    /**
     * An array of minimatch patterns to add to the list of default exclusions for packages
     */
    extraExcludes?: string[];
    /**
     * An array of minimatch patterns which exclude files from being automatically transformed
     * when being copied into the build.
     */
    noParse?: string[];
  };
  /**
   * A breif description of the package and what it provides
   */
  description?: string;
  /**
   * Creates sections in the documentations based on the exports of the folders listed here.
   * If you need this you should probably split up your package, which is why this is deprecated.
   * @deprecated
   */
  serviceFolders?: string[];
  /**
   * Specifies the group to which this package belongs
   */
  group?: KibanaGroup;
  /**
   * Specifies the package visibility, i.e. whether it can be accessed by everybody or only packages in the same group
   */
  visibility?: ModuleVisibility;
}

export interface PluginPackageManifest extends PackageManifestBaseFields {
  type: 'plugin';
  /**
   * Details about the plugin in this package
   */
  plugin: {
    id: string;
    browser: boolean;
    server: boolean;
    configPath?: string | string[];
    requiredPlugins?: string[];
    optionalPlugins?: string[];
    requiredBundles?: string[];
    runtimePluginDependencies?: string[];
    enabledOnAnonymousPages?: boolean;
    enableLazyInitialize?: boolean;
    type?: 'preboot';
    extraPublicDirs?: string[];
    [PLUGIN_CATEGORY]?: PluginCategoryInfo;
  };
}

export interface SharedBrowserPackageManifest extends PackageManifestBaseFields {
  type: 'shared-browser' | 'shared-common';
  /**
   * When a package is used by many other packages in the browser, or requires some
   * specific state in the module scope (though we highly recommend against this) you
   * can set `sharedBrowserBundle` to true so this package to load in a separate async
   * bundle request rather than being copied into the bundles of each package which
   * use it. (not yet implemented)
   */
  sharedBrowserBundle?: boolean;
}

export interface BasePackageManifest extends PackageManifestBaseFields {
  type: 'shared-server' | 'functional-tests' | 'test-helper' | 'shared-scss' | 'core' | 'tooling';
}

export type KibanaPackageManifest =
  | PluginPackageManifest
  | SharedBrowserPackageManifest
  | BasePackageManifest;

export type PluginPackage = Package & {
  manifest: PluginPackageManifest;
};

export interface PluginSelector {
  /**
   * Set to `true` to exclude any x-pack plugins (including tests/example plugins if those are enabled)
   */
  oss?: boolean;
  /**
   * Set to `true` to include example plugins
   */
  examples?: boolean;
  /**
   * Set to `true` to include test plugins
   */
  testPlugins?: boolean;
  /**
   * Absolute paths to specific plugin package which will always be included, regardless of the other settings
   */
  paths?: readonly string[];
  /**
   * Absolute paths to parent directories of plugin packages which will always be included, regardless of the other settings
   */
  parentDirs?: readonly string[];
  /**
   * Absolute paths to parent directories of plugin packages which will always be included, regardless of the other settings
   */
  limitParentDirs?: readonly string[];
  /**
   * When set to true, only select plugins which have server-side components
   */
  server?: boolean;
  /**
   * When set to true, only select plugins which have browser-side components
   */
  browser?: boolean;
  /**
   * When defined, only select plugins that belong to the specified groups
   */
  allowlistPluginGroups?: readonly KibanaGroup[];
}

export interface KbnImportReq {
  /**
   * The package id referenced by the import request
   */
  pkgId: string;
  /**
   * The directory/file imported within the package, empty string for imports without a specific target
   */
  target: string;
  /**
   * The entire import request
   */
  full: string;
}

export interface PluginCategoryInfo {
  /** is this an oss plugin? */
  oss: boolean;
  /** is this an example plugin? */
  example: boolean;
  /** is this a test plugin? */
  testPlugin: boolean;
}
