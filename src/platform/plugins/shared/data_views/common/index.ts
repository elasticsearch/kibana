/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export {
  DEFAULT_ASSETS_TO_IGNORE,
  META_FIELDS,
  DATA_VIEW_SAVED_OBJECT_TYPE,
  MAX_DATA_VIEW_FIELD_DESCRIPTION_LENGTH,
  HasEsDataFailureReason,
} from './constants';
export { LATEST_VERSION } from './content_management/v1/constants';

export type { ToSpecConfig } from './fields';
export type { IIndexPatternFieldList } from './fields';
export {
  isFilterable,
  fieldList,
  DataViewField,
  isNestedField,
  isMultiField,
  getFieldSubtypeMulti,
  getFieldSubtypeNested,
} from './fields';
export type {
  FieldFormatMap,
  RuntimeType,
  RuntimePrimitiveTypes,
  RuntimeField,
  RuntimeFieldSpec,
  RuntimeFieldSubField,
  RuntimeFieldSubFields,
  DataViewAttributes,
  OnNotification,
  OnError,
  UiSettingsCommon,
  PersistenceAPI,
  GetFieldsOptions,
  IDataViewsApiClient,
  SavedObject,
  AggregationRestrictions,
  TypeMeta,
  FieldSpecConflictDescriptions,
  FieldSpec,
  DataViewFieldMap,
  DataViewSpec,
  SourceFilter,
  HasDataService,
  RuntimeFieldBase,
  FieldConfiguration,
  SavedObjectsClientCommonFindArgs,
  FieldAttrs,
  FieldAttrSet,
} from './types';
export { DataViewType } from './types';

export type {
  DataViewsContract,
  DataViewsServiceDeps,
  DataViewSavedObjectAttrs,
} from './data_views';
export { DataViewsService, DataViewPersistableStateService } from './data_views';
export type {
  DataViewListItem,
  DataViewsServicePublicMethods,
  TimeBasedDataView,
} from './data_views';
export { DataView, DataViewLazy, AbstractDataView } from './data_views';
export {
  DuplicateDataViewError,
  DataViewSavedObjectConflictError,
  DataViewInsufficientAccessError,
} from './errors';
export type {
  IndexPatternExpressionType,
  IndexPatternLoadStartDependencies,
  IndexPatternLoadExpressionFunctionDefinition,
} from './expressions';
export { getIndexPatternLoadMeta } from './expressions';
export { DataViewMissingIndices } from './lib/errors';
