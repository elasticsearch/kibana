/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  esqlResponseToJson,
  flattenMapping,
  cleanupMapping,
  getIndexMappings,
  executeEsql,
  isCcsTarget,
  partitionByCcs,
  getFieldsFromFieldCaps,
  getIndexFields,
  validateEsqlQuery,
  type IndexFieldsResult,
  type IndexFieldType,
  type MappingField,
} from './tools/utils';
export {
  getDocumentById,
  type GetDocumentByIdResult,
  listIndices,
  type ListIndexDetailInfo,
  type ListIndexBasicInfo,
  listSearchSources,
  type AliasSearchSource,
  type IndexSearchSource,
  type DataStreamSearchSource,
  type EsSearchSource,
  type ListSourcesResponse,
} from './tools/steps';
export {
  indexExplorer,
  type IndexExplorerResponse,
  generateEsql,
  type GenerateEsqlResponse,
  generateEsqlCompletion,
  type GenerateEsqlCompletionResponse,
  relevanceSearch,
  type RelevanceSearchResponse,
  naturalLanguageSearch,
  type NaturalLanguageSearchResponse,
  runSearchTool,
  type TopSnippetsConfig,
} from './tools';
export {
  resolveResourceForEsqlWithSamplingStats,
  type ResolvedResourceWithSampling,
  formatResourceWithSampledValues,
} from './tools/utils/resources';
export { type MappingFieldWithStats } from './tools/utils/sampling';
