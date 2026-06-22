/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginName, DiscoveredPlugin } from '@kbn/core-base-common';
import type { ThemeVersion } from '@kbn/ui-shared-deps-npm';
import type { EnvironmentMode, PackageInfo } from '@kbn/config';
import type { CustomBranding } from '@kbn/core-custom-branding-common';
import type { DarkModeValue, ThemeName } from '@kbn/core-ui-settings-common';
import type { BrowserLoggingConfig } from '@kbn/core-logging-common-internal';

/** @internal */
export interface InjectedMetadataClusterInfo {
  cluster_uuid?: string;
  cluster_name?: string;
  cluster_version?: string;
  cluster_build_flavor?: string;
}

/** @internal */
export interface InjectedMetadataPlugin {
  id: PluginName;
  plugin: DiscoveredPlugin;
  config?: {
    [key: string]: unknown;
  };
}

/** @internal */
export interface InjectedMetadataExternalUrlPolicy {
  allow: boolean;
  host?: string;
  protocol?: string;
}

/** @internal */
export interface InjectedMetadataTheme {
  darkMode: DarkModeValue;
  name: ThemeName;
  version: ThemeVersion;
  stylesheetPaths: {
    default: string[];
    dark: string[];
  };
}

/** @internal */
export interface InjectedMetadata {
  version: string;
  buildNumber: number;
  branch: string;
  basePath: string;
  serverBasePath: string;
  spaceId: string;
  publicBaseUrl?: string;
  assetsHrefBase: string;
  clusterInfo: InjectedMetadataClusterInfo;
  logging: BrowserLoggingConfig;
  env: {
    mode: EnvironmentMode;
    packageInfo: PackageInfo;
    airgapped: boolean;
    isCoreRenderingInReactConcurrentMode: boolean;
  };
  featureFlags?: {
    overrides: Record<string, unknown>;
    initialFeatureFlags: Record<string, unknown>;
  };
  anonymousStatusPage: boolean;
  i18n: {
    translationsUrl: string;
    availableLocales: Array<{ id: string; label: string }>;
  };
  theme: InjectedMetadataTheme;
  csp: {
    warnLegacyBrowsers: boolean;
  };
  externalUrl: { policy: InjectedMetadataExternalUrlPolicy[] };
  apmConfig: Record<string, unknown> | null;
  uiPlugins: InjectedMetadataPlugin[];
  legacyMetadata: {
    uiSettings: {
      defaults: Record<string, any>; // UiSettingsRuntimeEntry (value, type, readonlyMode)
      user: Record<string, any>; // UserProvidedValues (userValue, isOverridden)
    };
    globalUiSettings: {
      defaults: Record<string, any>; // UiSettingsRuntimeEntry (value, type, readonlyMode)
      user: Record<string, any>; // UserProvidedValues (userValue, isOverridden)
    };
  };
  customBranding: Pick<CustomBranding, 'logo' | 'customizedLogo' | 'pageTitle'>;
  userStorage: {
    values: Record<string, unknown>;
  };
}
