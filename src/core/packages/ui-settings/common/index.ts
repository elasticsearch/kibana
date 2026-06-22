/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  UiSettingsType,
  ReadonlyModeType,
  DeprecationSettings,
  UiSettingsSolutions,
  UiSettingsParams,
  UiSettingsRuntimeEntry,
  UserProvidedValues,
  UiSettingsScope,
  GetUiSettingsContext,
  TechnicalPreviewSettings,
} from './src/ui_settings';
export { type DarkModeValue, parseDarkModeValue } from './src/dark_mode';
export {
  DEFAULT_THEME_TAGS,
  SUPPORTED_THEME_TAGS,
  DEFAULT_THEME_NAME,
  SUPPORTED_THEME_NAMES,
  FALLBACK_THEME_TAG,
  parseThemeTags,
  hasNonDefaultThemeTags,
  parseThemeNameValue,
  type ThemeName,
  type ThemeTag,
  type ThemeTags,
} from './src/theme';

export { TIMEZONE_OPTIONS } from './src/timezones';
