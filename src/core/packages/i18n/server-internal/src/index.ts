/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { config } from './i18n_config';
export type { I18nConfigType } from './i18n_config';
export { I18nService } from './i18n_service';
export type { InternalI18nServicePreboot } from './i18n_service';
export { resolveLocale, buildKbnLocaleCookie } from './resolve_locale';
export type {
  ResolveLocaleArgs,
  ResolveLocaleResult,
  BuildKbnLocaleCookieArgs,
} from './resolve_locale';
