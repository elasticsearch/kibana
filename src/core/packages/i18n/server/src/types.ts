/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AvailableLocale, TranslateArguments } from '@kbn/i18n';
import type { KibanaRequest } from '@kbn/core-http-server';

/**
 * A request-scoped i18n client that translates strings into the locale Kibana
 * resolved for the current request (profile → cookie → Accept-Language on
 * serverless → `i18n.defaultLocale`).
 *
 * The methods are asynchronous because resolving the locale for the request may
 * require an awaited user-profile lookup on the first call. The resolved locale
 * is memoised on the client, so subsequent calls do no additional I/O.
 *
 * @public
 */
export interface RequestI18nClient {
  /** Returns the locale resolved for the current request. */
  getLocale(): Promise<string>;
  /** Translates a message by id into the request's resolved locale. */
  translate(id: string, args: TranslateArguments): Promise<string>;
  /** Formats a list of values using the request's resolved locale. */
  formatList(type: 'conjunction' | 'disjunction' | 'unit', value: string[]): Promise<string>;
}

/**
 * @public
 */
export interface I18nServiceStart {
  /**
   * Returns a {@link RequestI18nClient} scoped to the given request's resolved
   * locale.
   */
  asScopedToRequest(request: KibanaRequest): RequestI18nClient;
}

/**
 * Core's `i18n` request handler context. Exposed as `context.core.i18n`, it
 * translates strings into the locale resolved for the current request.
 *
 * @public
 */
export type I18nRequestHandlerContext = RequestI18nClient;

/**
 * @public
 */
export interface I18nServiceSetup {
  /**
   * Return the server's default locale, as configured by `i18n.defaultLocale`
   * (or the deprecated `i18n.locale`).
   */
  getLocale(): string;

  /**
   * Return the locales the deployment offers in the language picker, as
   * configured by `i18n.locales`. Returns an empty array when the picker
   * is disabled (i.e., `i18n.locales: []`).
   */
  getLocales(): readonly string[];

  /**
   * Return the available locales paired with their display labels. Suitable
   * for rendering language pickers; returns an empty array when the picker
   * is disabled.
   */
  getAvailableLocales(): ReadonlyArray<AvailableLocale>;

  /**
   * Return the absolute paths to translation files currently in use.
   */
  getTranslationFiles(): string[];

  /**
   * Returns the hash generated from the current translations.
   */
  getTranslationHash(): string;

  /**
   * Returns a map of locale ID to translation content hash for all configured locales.
   */
  getTranslationHashes(): Record<string, string>;

  /**
   * When `true`, Kibana writes a `KBN_LOCALE` cookie on every rendered
   * response so the browser remembers the resolved locale across page loads,
   * anonymous pages, and post-logout browsing. Controlled by
   * `i18n.allowLocaleCookie` in `kibana.yml`. Defaults to `true`.
   */
  allowLocaleCookie: boolean;
}
