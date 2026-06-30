/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createIntl } from '@formatjs/intl';
import type { IntlShape } from '@formatjs/intl';

import type { Translation, TranslationInput } from '../translation';
import { defaultEnFormats } from './formats';
import {
  EN_LOCALE,
  createTranslationIntl,
  formatList as formatListWithIntl,
  formatMessage as formatMessageWithIntl,
} from './formatter';
import type { TranslateArguments } from './formatter';

export { EN_LOCALE } from './formatter';
export type { TranslateArguments } from './formatter';

const defaultLocale = EN_LOCALE;

/**
 * Currently we are depending on this singleton pattern to
 * update the locale. This is mainly to make it easier on developers
 * to use i18n by importing it anywhere in their code and using it directly
 * without having to pass it around.
 * This pattern has several limitations and can cause unexpected bugs. The main limitation
 * is that we cannot server multiple locales on the server side based on the user requested
 * locale.
 *
 * For request-scoped, per-locale translation that avoids this shared mutable
 * state, use `createScopedTranslator` instead.
 */
let intl: IntlShape<string>;
let isInitialized = false;
/**
 * ideally here we would be using a `throw new Error()` if i18n.translate is called before init();
 * to make sure i18n is initialized before any message is attempting to be translated.
 *
 * Especially since these messages will go unnoticed since the translations might be provided in the translation files
 * but Kibana will use the default message since the locales are not loaded yet.
 *
 * we need to get there at some point but this means removing all static i18n imports from the server side.
 */
intl = createIntl({
  locale: defaultLocale,
  defaultFormats: defaultEnFormats,
  defaultLocale,
  onError: () => void 0,
});

export const getIsInitialized = () => {
  return isInitialized;
};

/**
 * Provides a way to register translations with the engine
 */
export function activateTranslation(newTranslation: TranslationInput) {
  intl = createTranslationIntl(newTranslation);
}

/**
 * Returns messages for the current language
 */
export function getTranslation(): Translation {
  return {
    messages: intl.messages,
    locale: intl.locale,
    defaultLocale: intl.defaultLocale,
    defaultFormats: intl.defaultFormats,
    formats: intl.formats,
  };
}

/**
 * Returns the current locale
 * Shortcut to getTranslation().locale
 */
export function getLocale() {
  return intl.locale;
}

/**
 * Translate message by id
 * @param id - translation id to be translated
 * @param [options]
 * @param [options.values] - values to pass into translation
 * @param [options.defaultMessage] - will be used unless translation was successful
 * @param [options.description] - message description, used by translators and other devs to understand the message context.
 * @param [options.ignoreTag] - Whether to treat HTML/XML tags as string literal instead of parsing them as tag token. When this is false we only allow simple tags without any attributes
 * @param [options.formatters] - Custom formatters to override the default intl formatters
 */
export function translate(id: string, args: TranslateArguments): string {
  return formatMessageWithIntl(intl, id, args);
}

/**
 * Formats a list of values using the current locale.
 * @param type - The type of list formatting (e.g., 'conjunction', 'disjunction', 'unit').
 * @param value - The array of string values to format.
 * @returns The formatted list string.
 */
export function formatList(type: 'conjunction' | 'disjunction' | 'unit', value: string[]): string {
  return formatListWithIntl(intl, type, value);
}

/**
 * Initializes the engine
 * @param newTranslation
 */
export function init(newTranslation?: TranslationInput) {
  if (typeof newTranslation?.locale !== 'string') {
    return;
  }

  activateTranslation(newTranslation);
  isInitialized = true;
}

/**
 * Marks the engine as initialized without loading any translation file.
 * Call this when the effective locale is English so the pre-allocated default
 * `intl` instance (which is already wired to English) is used directly,
 * avoiding an unnecessary network round-trip and React context re-render.
 */
export function initDefault() {
  isInitialized = true;
}

/**
 * Loads JSON with translations from the specified URL and initializes i18n engine with them.
 * @param translationsUrl URL pointing to the JSON bundle with translations.
 */
export async function load(translationsUrl: string) {
  // Once this package is integrated into core Kibana we should switch to an abstraction
  // around `fetch` provided by the platform, e.g. `kfetch`.
  const response = await fetch(translationsUrl, {
    credentials: 'same-origin',
  });

  if (response.status >= 400) {
    throw new Error(`Translations request failed with status code: ${response.status}`);
  }

  const newTranslation = await response.json();
  if (!newTranslation || !newTranslation.locale || typeof newTranslation.locale !== 'string') {
    return;
  }

  init(newTranslation);
  isInitialized = true;
}
