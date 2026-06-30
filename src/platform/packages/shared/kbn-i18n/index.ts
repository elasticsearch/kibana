/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  formatList,
  getIsInitialized,
  getLocale,
  getTranslation,
  handleIntlError,
  init,
  initDefault,
  load,
  translate,
} from './src/core';

import {
  registerTranslationFile,
  registerTranslationFiles,
  getTranslationsByLocale,
  getAllTranslations,
  getAllTranslationsFromPaths,
  getRegisteredLocales as getRegisteredLocalesForLoader,
} from './src/loader';

const i18n = {
  getTranslation,
  getLocale,
  translate,
  formatList,
  init,
  initDefault,
  load,
  handleIntlError,
  getIsInitialized,
};

const i18nLoader = {
  registerTranslationFile,
  registerTranslationFiles,
  getTranslationsByLocale,
  getAllTranslations,
  getAllTranslationsFromPaths,
  getRegisteredLocales: getRegisteredLocalesForLoader,
};

export type { Translation, TranslationInput } from './src/translation';
export type { Formats, TranslateArguments } from './src/core';
export { EN_LOCALE } from './src/core';
export {
  SUPPORTED_LOCALE_IDS,
  getLocaleLabel,
  toCanonicalLocaleId,
  setAvailableLocales,
  getAvailableLocales,
  getBrowserPreferredLocale,
} from './src/locales';
export type { AvailableLocale, SupportedLocaleId } from './src/locales';
export { i18n, i18nLoader };
