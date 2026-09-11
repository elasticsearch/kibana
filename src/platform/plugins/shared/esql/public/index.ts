/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PluginInitializerContext } from '@kbn/core/public';
import { EsqlPlugin, type EsqlPluginSetup, type EsqlPluginStart } from './plugin';

export { ESQLLangEditor } from './create_editor';
export { ESQLMenu, EsqlEditorActionsProvider } from './lazy_esql_menu';
export { useESQLQueryStats } from './hooks/use_esql_query_stats';
export type {
  ESQLEditorProps,
  DataErrorsControl,
  RestorableStateProviderApi,
} from '@kbn/esql-editor';
export type { EsqlPluginSetup, EsqlPluginStart };

export function plugin(initContext: PluginInitializerContext) {
  return new EsqlPlugin(initContext);
}
