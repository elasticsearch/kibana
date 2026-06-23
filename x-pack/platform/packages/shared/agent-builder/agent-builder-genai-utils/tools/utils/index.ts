/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  esqlResponseToJson,
  extractEsqlQueries,
  executeEsql,
  interpolateEsqlQuery,
  validateEsqlQuery,
} from './esql';
export {
  flattenMapping,
  cleanupMapping,
  getIndexMappings,
  getDataStreamMappings,
  type MappingField,
} from './mappings';
export {
  processFieldCapsResponse,
  processFieldCapsResponsePerIndex,
  type FieldListFromFieldCapsResponse,
} from './field_caps';
export {
  isCcsTarget,
  partitionByCcs,
  getFieldsFromFieldCaps,
  getBatchedFieldsFromFieldCaps,
  getIndexFields,
  type IndexFieldsResult,
  type IndexFieldType,
} from './ccs';
export { generateXmlTree, type XmlNode } from './formatting';
export { errorResult, otherResult } from './results';
export { estimateTokens, truncateTokens } from './token_count';
