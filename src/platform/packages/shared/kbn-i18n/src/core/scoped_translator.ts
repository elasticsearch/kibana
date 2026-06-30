/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TranslationInput } from '../translation';
import {
  createTranslationIntl,
  formatList as formatListWithIntl,
  formatMessage as formatMessageWithIntl,
} from './formatter';
import type { TranslateArguments } from './formatter';

/**
 * A request-scoped translator bound to a single locale. Unlike the `@kbn/i18n`
 * singleton, each instance owns its own `intl` formatter, so multiple locales
 * can be translated concurrently without any shared mutable state.
 */
export interface ScopedTranslator {
  /** Returns the (normalized) locale this translator was built for. */
  getLocale(): string;
  /** Translates a message by id. See {@link TranslateArguments}. */
  translate(id: string, args: TranslateArguments): string;
  /** Formats a list of values using this translator's locale. */
  formatList(type: 'conjunction' | 'disjunction' | 'unit', value: string[]): string;
}

/**
 * Builds a {@link ScopedTranslator} for the provided translation input. The
 * underlying `intl` instance is private to the returned translator — building
 * or using a scoped translator never mutates the `@kbn/i18n` singleton.
 */
export const createScopedTranslator = (translationInput: TranslationInput): ScopedTranslator => {
  const intl = createTranslationIntl(translationInput);

  return {
    getLocale: () => intl.locale,
    translate: (id, args) => formatMessageWithIntl(intl, id, args),
    formatList: (type, value) => formatListWithIntl(intl, type, value),
  };
};
