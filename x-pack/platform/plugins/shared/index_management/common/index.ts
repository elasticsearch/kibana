/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// TODO: https://github.com/elastic/kibana/issues/110892

export { API_BASE_PATH, INTERNAL_API_BASE_PATH, BASE_PATH, MAJOR_VERSION } from './constants';

export { getTemplateParameter, splitSizeAndUnits } from './lib';

export type {
  Aliases,
  Index,
  IndexSettings,
  IndexSettingsResponse,
  Mappings,
  MappingsResponse,
  TemplateSerialized,
  TemplateDeserialized,
  TemplateType,
  TemplateFromEs,
  TemplateListItem,
  LegacyTemplateSerialized,
  EnhancedDataStreamFromEs,
  Health,
  DataStream,
  DataStreamIndex,
  DataRetention,
  IndexMode,
  ComponentTemplateSerialized,
  ComponentTemplateDeserialized,
  ComponentTemplateFromEs,
  ComponentTemplateListItem,
  ComponentTemplateDatastreams,
  ComponentTemplateMeta,
  FieldItem,
  IndexWithFields,
  FieldFromIndicesRequest,
  SnapshotRepositoriesInfo,
} from './types';
