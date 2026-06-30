/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createIntl, createIntlCache } from '@formatjs/intl';
import type { Formatters, IntlConfig, IntlShape, MessageDescriptor } from '@formatjs/intl';

import type { TranslationInput } from '../translation';
import { handleIntlError } from './error_handler';
import { defaultEnFormats } from './formats';
import type { FormatXMLElementFn, PrimitiveType } from './types';

export const EN_LOCALE = 'en';

/**
 * Normalizes locale to make it consistent with IntlMessageFormat locales
 * @param locale
 */
const normalizeLocale = (locale: string): string => {
  return locale.toLowerCase();
};

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
 * Builds an isolated `IntlShape` for the given translation input. Mirrors the
 * configuration used by the `@kbn/i18n` singleton, but returns a fresh instance
 * with its own cache so callers can format messages for a specific locale
 * without mutating shared state.
 */
export const createTranslationIntl = (newTranslation: TranslationInput): IntlShape<string> => {
  if (!newTranslation.locale || typeof newTranslation.locale !== 'string') {
    throw new Error('[I18n] A `locale` must be a non-empty string to add messages.');
  }

  const config: IntlConfig<string> = {
    locale: normalizeLocale(newTranslation.locale),
    messages: newTranslation.messages,
    defaultFormats: defaultEnFormats,
    defaultLocale: EN_LOCALE,
    onError: handleIntlError,
  };

  // formatJS differentiates between `formats: undefined` and unset `formats`.
  if (newTranslation.formats) {
    config.formats = newTranslation.formats;
  }

  const cache = createIntlCache();
  return createIntl(config, cache);
};

/**
 * Translates a message by id against the supplied `intl` instance.
 * @param intl - the formatter instance to use
 * @param id - translation id to be translated
 * @param [options] - see {@link TranslateArguments}
 */
export const formatMessage = (
  intl: IntlShape<string>,
  id: string,
  { values = {}, description, defaultMessage, ignoreTag, formatters }: TranslateArguments
): string => {
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
};

/**
 * Formats a list of values using the supplied `intl` instance.
 * @param intl - the formatter instance to use
 * @param type - The type of list formatting (e.g., 'conjunction', 'disjunction', 'unit').
 * @param value - The array of string values to format.
 * @returns The formatted list string.
 */
export const formatList = (
  intl: IntlShape<string>,
  type: 'conjunction' | 'disjunction' | 'unit',
  value: string[]
): string => {
  try {
    return intl.formatList(value, { type });
  } catch (e) {
    throw new Error(`[I18n] Error formatting list ${JSON.stringify(value)}: ${e}`);
  }
};
