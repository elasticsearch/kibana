/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Side-effect import so the `GlobalMeta` augmentation (adding the typed
// `openapi` field to `.meta()`) is included wherever `@kbn/zod` is imported.
import './openapi';

export * from 'zod/v4';
export { isZod } from './utils';
export { lazySchema, setLazySchemaDisabled } from './lazy_schema';
export type { ZodObjectType } from './types';
export type { OasMetaExtensions, OasMetaAvailability } from './openapi';

export {
  savedObjectId,
  savedObjectType,
  savedObjectVersion,
  spaceId,
  displayName,
  description,
  searchFilter,
  aggregation,
  querySortField,
  unboundedString,
} from './string_helpers';
export type {
  ZodStringOptions,
  ZodStringWarnOptions,
  ZodStringHelper,
  UnboundedStringOptions,
} from './string_helpers';
