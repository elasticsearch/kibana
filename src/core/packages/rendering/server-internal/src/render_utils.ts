/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom } from 'rxjs';
import * as UiSharedDepsSrc from '@kbn/ui-shared-deps-src';
import type { IConfigService } from '@kbn/config';
import type { BrowserLoggingConfig } from '@kbn/core-logging-common-internal';
import type {
  ThemeName,
  UiSettingsRuntimeEntry,
  UserProvidedValues,
} from '@kbn/core-ui-settings-common';
import {
  config as loggingConfigDef,
  type LoggingConfigWithBrowserType,
} from '@kbn/core-logging-server-internal';
import type { DarkModeValue } from '@kbn/core-ui-settings-common';

export const getSettingValue = <T>(
  settingName: string,
  settings: {
    user?: Record<string, UserProvidedValues<unknown>>;
    defaults: Readonly<Record<string, UiSettingsRuntimeEntry>>;
  },
  convert: (raw: unknown) => T
): T => {
  const value = settings.user?.[settingName]?.userValue ?? settings.defaults[settingName].value;
  return convert(value);
};

export const getBundlesHref = (baseHref: string): string => `${baseHref}/bundles`;

export const getScriptPaths = ({
  themeName,
  baseHref,
  darkMode,
}: {
  baseHref: string;
  darkMode: DarkModeValue;
  themeName: ThemeName;
}) => {
  if (darkMode === 'system') {
    return [`${baseHref}/ui/bootstrap_system_theme_borealis.js`];
  } else {
    return [];
  }
};

export const getCommonStylesheetPaths = ({ baseHref }: { baseHref: string }) => {
  const bundlesHref = getBundlesHref(baseHref);
  return [
    `${bundlesHref}/kbn-ui-shared-deps-src/${UiSharedDepsSrc.cssDistFilename}`,
    `${baseHref}/ui/legacy_styles.css`,
  ];
};

export const getThemeStylesheetPaths = ({
  darkMode,
  baseHref,
}: {
  darkMode: boolean;
  baseHref: string;
}) => {
  return [
    ...(darkMode
      ? [
          `${baseHref}/ui/legacy_dark_theme.min.css`,
          `${baseHref}/ui/charts/theme_only_dark.css`, // Elastic Charts' CSS (dark theme)
        ]
      : [
          `${baseHref}/ui/legacy_light_theme.min.css`,
          `${baseHref}/ui/charts/theme_only_light.css`, // Elastic Charts' CSS (light theme)
        ]),
  ];
};

export const getBrowserLoggingConfig = async (
  configService: IConfigService
): Promise<BrowserLoggingConfig> => {
  const loggingConfig = await firstValueFrom(
    configService.atPath<LoggingConfigWithBrowserType>(loggingConfigDef.path)
  );
  return loggingConfig.browser;
};
