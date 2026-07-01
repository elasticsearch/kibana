/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Command registry - the main command registry instance and related utilities
export * from './registry';
export type { ESQLCommandSummary } from './registry/types';

// Command definitions - constants, types, and utilities for defining commands
export * from './definitions/constants';
export * from './definitions/types';
export * from './definitions/all_operators';
export * from './definitions/utils/promql';

// Utilities from definitions
export { ESQL_APPLY_TEXT_REPLACEMENT_COMMAND } from './registry/constants';
export { METADATA_FIELDS } from './registry/options/metadata';
export { TIME_SYSTEM_PARAMS } from './definitions/utils/literals';
export { withAutoSuggest } from './definitions/utils/autocomplete/helpers';
export { getIndexSourcesFromQuery } from './definitions/utils/sources';
export { getPromqlBracketsToClose, unwrapExpressionParens } from './definitions/utils/ast';
export {
  Commands as CommandNames,
  Functions as FunctionNames,
  Settings as SettingNames,
} from './definitions/keywords';
