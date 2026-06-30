/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  getUniqueId,
  getChildFieldsName,
  getFieldMeta,
  getTypeLabelFromField,
  getFieldConfig,
  getTypeMetaFromSource,
  normalize,
  deNormalize,
  updateFieldsPathAfterFieldNameChange,
  getAllChildFields,
  getAllDescendantAliases,
  getFieldAncestors,
  filterTypesForMultiField,
  filterTypesForNonRootFields,
  getMaxNestedDepth,
  buildFieldTreeFromIds,
  shouldDeleteChildFieldsAfterTypeChange,
  canUseMappingsEditor,
  stripUndefinedValues,
  normalizeRuntimeFields,
  deNormalizeRuntimeFields,
  getAllFieldTypesFromState,
  getFieldsFromState,
  getFieldsMatchingFilterFromState,
  getStateWithCopyToFields,
  hasSemanticTextField,
} from './utils';

export * from './serializers';

export * from './validators';

export * from './mappings_validator';

export * from './search_fields';

export * from './extract_mappings_definition';
