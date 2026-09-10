/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { MappingEditor } from './mapping_editor';
export type { MappingEditorProps } from './mapping_editor';
export {
  emptyMappingEditorValue,
  buildDatasetMappings,
  validateMappingEditorValue,
  DataType,
} from './mapping_editor';
export type { MappingEditorValue, MappingEditorField } from './mapping_editor';
