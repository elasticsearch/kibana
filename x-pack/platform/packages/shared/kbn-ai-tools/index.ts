/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { describeDataset } from './src/tools/describe_dataset';

export { formatDocumentAnalysis } from './src/tools/describe_dataset/format_document_analysis';

export { mergeSampleDocumentsWithSchema } from './src/tools/describe_dataset/merge_sample_documents_with_schema';
export {
  getSampleDocuments,
  getSampleDocumentsEsql,
} from './src/tools/describe_dataset/get_sample_documents';
export { getDiverseSampleDocuments } from './src/tools/describe_dataset/get_diverse_sample_documents';
export type {
  DocumentAnalysis,
  FormattedDocumentAnalysis,
} from './src/tools/describe_dataset/document_analysis';
export {
  getLogPatterns,
  getSigEventsLogPatternsEsql,
  type LogPatternEsqlEntry,
  type FieldPatternResultWithChanges,
} from './src/tools/log_patterns/get_log_patterns';
export {
  pValueToLabel,
  P_VALUE_SIGNIFICANCE_HIGH,
  P_VALUE_SIGNIFICANCE_MEDIUM,
} from './src/utils/p_value_to_label';
export {
  getEsqlColumnSchema,
  type EsqlColumnSchema,
  type GetEsqlColumnSchemaParams,
} from './src/utils/get_esql_column_schema';
export {
  parseEsqlSourceDocuments,
  getEsqlDocumentId,
  type EsqlSourceDocument,
} from './src/utils/parse_esql_source_documents';

export { executeAsEsqlAgent } from './src/tools/esql';
