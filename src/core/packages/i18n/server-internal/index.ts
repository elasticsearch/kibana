/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { I18nConfigType, InternalI18nServicePreboot } from './src';
export { config, I18nService } from './src';
export { resolveLocale, buildKbnLocaleCookie } from './src';
export type { ResolveLocaleArgs, ResolveLocaleResult, BuildKbnLocaleCookieArgs } from './src';
export {
  discoverAllTranslationPaths,
  getKibanaTranslationFiles,
} from './src/get_kibana_translation_files';
