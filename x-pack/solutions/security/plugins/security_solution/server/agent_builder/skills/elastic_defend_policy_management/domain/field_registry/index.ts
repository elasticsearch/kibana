/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  FieldRegistryEntry,
  FieldRegistryKind,
  FieldRegistryProductFeatureGate,
  FieldRegistrySource,
  FieldRegistryTier,
} from './types';
export { isDerivedPath, isExcludedPath } from './path_rules';
export {
  getFieldRegistry,
  getFieldRegistryEntry,
  getOsLessRemainderEntries,
  getProtectionKeyPathEntries,
  isWritablePath,
} from './derive_field_registry';
