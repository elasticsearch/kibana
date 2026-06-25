/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createIntl, createIntlCache } from '@formatjs/intl';
import type { MessageDescriptor, Formatters, IntlConfig, IntlShape } from '@formatjs/intl';
import { handleIntlError } from './error_handler';

import type { Translation, TranslationInput } from '../translation';
import { defaultEnFormats } from './formats';
import type { FormatXMLElementFn, PrimitiveType } from './types';

export const EN_LOCALE = 'en';
const defaultLocale = EN_LOCALE;

/**
 * Currently we are depending on this singleton pattern to
 * update the locale. This is mainly to make it easier on developers
 * to use i18n by importing it anywhere in their code and using it directly
 * without having to pass it around.
 * This pattern has several limitations and can cause unexpected bugs. The main limitation
 * is that we cannot server multiple locales on the server side based on the user requested
 * locale.
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
 * Normalizes locale to make it consistent with IntlMessageFormat locales
 * @param locale
 */
function normalizeLocale(locale: string) {
  return locale.toLowerCase();
}

/**
 * Provides a way to register translations with the engine
 */
export function activateTranslation(newTranslation: TranslationInput) {
  if (!newTranslation.locale || typeof newTranslation.locale !== 'string') {
    throw new Error('[I18n] A `locale` must be a non-empty string to add messages.');
  }
  const config: IntlConfig<string> = {
    locale: normalizeLocale(newTranslation.locale),
    messages: newTranslation.messages,
    defaultFormats: defaultEnFormats,
    defaultLocale,
    onError: handleIntlError,
  };

  // formatJS differentiates between `formats: undefined` and unset `formats`.
  if (newTranslation.formats) {
    config.formats = newTranslation.formats;
  }

  const cache = createIntlCache();
  intl = createIntl(config, cache);
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

type MessageFormatters = Pick<
  Formatters,
  'getNumberFormat' | 'getDateTimeFormat' | 'getPluralRules'
>;

export interface TranslateArguments {
  /**
   * Will be used unless translation was successful
   */
  defaultMessage: MessageDescriptor['defaultMessage'];
  /**
   * Message description, used by translators and other devs to understand the message context.
   */
  description?: MessageDescriptor['description'];
  /**
   * values to pass into translation
   */
  values?: Record<string, PrimitiveType | FormatXMLElementFn<string, string>>;
  /**
   * Whether to treat HTML/XML tags as string literal
   * instead of parsing them as tag token.
   * When this is false we only allow simple tags without
   * any attributes
   */
  ignoreTag?: boolean;
  /**
   * Custom formatters to override the default intl formatters
   */
  formatters?: MessageFormatters;
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
export function translate(
  id: string,
  { values = {}, description, defaultMessage, ignoreTag, formatters }: TranslateArguments
): string {
  if (!id || typeof id !== 'string') {
    throw new Error('[I18n] An `id` must be a non-empty string to translate a message.');
  }

  try {
    if (!defaultMessage) {
      throw new Error('Missing `defaultMessage`.');
    }

    return intl.formatMessage(
      {
        id,
        defaultMessage,
        description,
      },
      values,
      // @ts-expect-error - There’s a small mismatch between @formatjs type and Intl API that only applies to the date function, we’re ignoring that
      { ignoreTag, shouldParseSkeletons: true, formatters }
    );
  } catch (e) {
    throw new Error(`[I18n] Error formatting the default message for: "${id}".\n${e}`);
  }
}

/**
 * Formats a list of values using the current locale.
 * @param type - The type of list formatting (e.g., 'conjunction', 'disjunction', 'unit').
 * @param value - The array of string values to format.
 * @returns The formatted list string.
 */
export function formatList(type: 'conjunction' | 'disjunction' | 'unit', value: string[]): string {
  try {
    return intl.formatList(value, { type });
  } catch (e) {
    throw new Error(`[I18n] Error formatting list ${JSON.stringify(value)}: ${e}`);
  }
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
