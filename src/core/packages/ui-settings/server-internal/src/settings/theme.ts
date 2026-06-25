/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { i18n } from '@kbn/i18n';
import type { Writable } from '@kbn/utility-types';
import type { ThemeVersion } from '@kbn/ui-shared-deps-npm';
import {
  type UiSettingsParams,
  type ThemeName,
  parseThemeTags,
  SUPPORTED_THEME_NAMES,
  DEFAULT_THEME_NAME,
} from '@kbn/core-ui-settings-common';
import { defaultThemeSchema } from '../ui_settings_config';

/**
 * Resolves the default value for the `theme:darkMode` setting.
 *
 * The default is `'system'` so a brand-new user (with no persisted preference) gets a theme that
 * follows their OS appearance on first load. `'system'` requires that both the light and dark
 * stylesheets be available: dist builds always ship both, but a dev build may be restricted to a
 * single theme via `KBN_OPTIMIZER_THEMES` — in that case we must fall back to the one compiled
 * theme, otherwise `'system'` could reference an uncompiled stylesheet.
 */
const getDefaultDarkModeValue = ({
  isDist,
}: GetThemeSettingsOptions): 'enabled' | 'disabled' | 'system' => {
  // dist builds always ship both light and dark stylesheets, so `'system'` is always safe
  if (isDist) {
    return 'system';
  }

  const themeTags = parseThemeTags(process.env.KBN_OPTIMIZER_THEMES);
  const hasLight = themeTags.some((tag) => tag.endsWith('light'));
  const hasDark = themeTags.some((tag) => tag.endsWith('dark'));

  if (hasLight && hasDark) {
    return 'system';
  }

  // single-theme dev build: default to whichever theme is actually compiled
  return hasDark ? 'enabled' : 'disabled';
};

export interface GetThemeSettingsOptions {
  isDist: boolean;
  isThemeSwitcherEnabled: boolean | undefined;
  defaultTheme?: ThemeName;
}

export const getThemeSettings = (
  options: GetThemeSettingsOptions
): Record<string, UiSettingsParams> => {
  const defaultDarkMode = getDefaultDarkModeValue(options);
  const defaultTheme = options.defaultTheme ?? DEFAULT_THEME_NAME;

  return {
    'theme:darkMode': {
      name: i18n.translate('core.ui_settings.params.darkModeTitle', {
        defaultMessage: 'Dark mode',
      }),
      value: defaultDarkMode,
      description: i18n.translate('core.ui_settings.params.darkModeText', {
        defaultMessage:
          `The UI theme that the Kibana UI should use. ` +
          `Set to 'Enabled' to enable the dark theme, or 'Disabled' to disable it. ` +
          `Set to 'Sync with system' to have the Kibana UI theme follow the system theme. ` +
          `A page reload is required for the setting to be applied.`,
      }),
      type: 'select',
      options: ['enabled', 'disabled', 'system'],
      optionLabels: {
        enabled: i18n.translate('core.ui_settings.params.darkMode.options.enabled', {
          defaultMessage: `Enabled`,
        }),
        disabled: i18n.translate('core.ui_settings.params.darkMode.options.disabled', {
          defaultMessage: `Disabled`,
        }),
        system: i18n.translate('core.ui_settings.params.darkMode.options.system', {
          defaultMessage: `Sync with system`,
        }),
      },
      deprecation: {
        message: i18n.translate('core.ui_settings.params.darkModeDeprecation', {
          defaultMessage: 'This setting is deprecated and will be removed in Kibana 10.0.',
        }),
        docLinksKey: 'generalSettings',
      },
      requiresPageReload: true,
      schema: schema.oneOf([
        schema.literal('enabled'),
        schema.literal('disabled'),
        schema.literal('system'),
        // for backward-compatibility
        schema.boolean(),
      ]),
    },
    /**
     * Theme is sticking around as there are still a number of places reading it and
     * we might use it again in the future.
     */
    'theme:version': {
      name: i18n.translate('core.ui_settings.params.themeVersionTitle', {
        defaultMessage: 'Theme version',
      }),
      value: 'v8' as ThemeVersion,
      readonly: true,
      schema: schema.literal('v8'),
    },
    /**
     * Theme name is the (upcoming) replacement for theme versions.
     */
    'theme:name': {
      name: i18n.translate('core.ui_settings.params.themeName', {
        defaultMessage: 'Theme',
      }),
      type: 'select',
      // Cast to a mutable array to satisfy the `UiSettingsParams.options` type
      options: SUPPORTED_THEME_NAMES as Writable<typeof SUPPORTED_THEME_NAMES>,
      optionLabels: {
        borealis: i18n.translate('core.ui_settings.params.themeName.options.borealis', {
          defaultMessage: 'Borealis',
        }),
      },
      value: defaultTheme,
      readonly: !options.isThemeSwitcherEnabled,
      requiresPageReload: true,
      schema: defaultThemeSchema,
    },
  };
};
