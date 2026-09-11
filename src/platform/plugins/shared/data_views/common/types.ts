/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { SavedObject } from '@kbn/core/server';
import type { ErrorToastOptions, ToastInputFields } from '@kbn/core-notifications-browser';
import type { DataViewFieldBase } from '@kbn/es-query';
import type { SerializedFieldFormat } from '@kbn/field-formats-plugin/common';
import type { RUNTIME_FIELD_TYPES } from '@kbn/as-code-data-views-schema';

export type { QueryDslQueryContainer };
export type { SavedObject };

export type FieldFormatMap = Record<string, SerializedFieldFormat>;

/**
 * Runtime field types
 */
export type RuntimeType = (typeof RUNTIME_FIELD_TYPES)[number];

/**
 * Runtime field primitive types - excluding composite
 */
export type RuntimePrimitiveTypes = Exclude<RuntimeType, 'composite'>;

/**
 * Runtime field definition
 * @public
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type RuntimeFieldBase = {
  /**
   * Type of runtime field
   */
  type: RuntimeType;
  /**
   * Runtime field script
   */
  script?: {
    /**
     * Script source
     */
    source: string;
  };
};

/**
 * The RuntimeField that will be sent in the ES Query "runtime_mappings" object
 */
export type RuntimeFieldSpec = RuntimeFieldBase & {
  /**
   * Composite subfields
   */
  fields?: Record<
    string,
    {
      // It is not recursive, we can't create a composite inside a composite.
      type: RuntimePrimitiveTypes;
    }
  >;
};

/**
 * Field attributes that are user configurable
 * @public
 */
export interface FieldConfiguration {
  /**
   * Field format in serialized form
   */
  format?: SerializedFieldFormat | null;
  /**
   * Custom label
   */
  customLabel?: string;
  /**
   * Custom description
   */
  customDescription?: string;
  /**
   * Popularity - used for discover
   */
  popularity?: number;
}

/**
 * This is the RuntimeField interface enhanced with Data view field
 * configuration: field format definition, customLabel or popularity.
 * @public
 */
export interface RuntimeField extends RuntimeFieldBase, FieldConfiguration {
  /**
   * Subfields of composite field
   */
  fields?: RuntimeFieldSubFields;
}

export type RuntimeFieldSubFields = Record<string, RuntimeFieldSubField>;

/**
 * Runtime field composite subfield
 * @public
 */
export interface RuntimeFieldSubField extends FieldConfiguration {
  // It is not recursive, we can't create a composite inside a composite.
  type: RuntimePrimitiveTypes;
}

/**
 * Interface for the data view saved object
 * @public
 */
export interface DataViewAttributes {
  /**
   * Fields as a serialized array of field specs
   */
  fields?: string;
  /**
   * Data view title
   */
  title: string;
  /**
   * Data view type, default or rollup
   */
  type?: string;
  /**
   * Type metadata information, serialized. Only used by rollup data views.
   */
  typeMeta?: string;
  /**
   * Time field name
   */
  timeFieldName?: string;
  /**
   * Serialized array of filters. Used by discover to hide fields.
   */
  sourceFilters?: string;
  /**
   * Serialized map of field formats by field name
   */
  fieldFormatMap?: string;
  /**
   * Serialized map of field attributes, currently field count and name
   */
  fieldAttrs?: string;
  /**
   * Serialized map of runtime field definitions, by field name
   */
  runtimeFieldMap?: string;
  /**
   * Prevents errors when index pattern exists before indices
   */
  allowNoIndex?: boolean;
  /**
   * Name of the data view. Human readable name used to differentiate data view.
   */
  name?: string;
  /**
   * Allow hidden and system indices when loading field list
   */
  allowHidden?: boolean;
}

/**
 * Set of field attributes
 * @public
 * Storage of field attributes. Necessary since the field list isn't saved.
 */
export type FieldAttrs = Map<string, FieldAttrSet>;

/**
 * Field attributes that are stored on the data view
 * @public
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FieldAttrSet = {
  /**
   * Custom field label
   */
  customLabel?: string;
  /**
   * Custom field description
   */
  customDescription?: string;
  /**
   * Popularity count - used for discover
   */
  count?: number;
};

export type FieldAttrsAsObject = Record<string, FieldAttrSet>;

/**
 * Handler for data view notifications
 * @public
 * @param toastInputFields Toast notif config
 * @param key Used to dedupe notifs
 */
export type OnNotification = (toastInputFields: ToastInputFields, key: string) => void;

/**
 * Handler for data view errors
 * @public
 * @param error Error object
 * @param toastInputFields Toast notif config
 * @param key Used to dedupe notifs
 */
export type OnError = (error: Error, toastInputFields: ErrorToastOptions, key: string) => void;

/**
 * Interface for UiSettings common interface {@link UiSettingsClient}
 */
export interface UiSettingsCommon {
  /**
   * Get a setting value
   * @param key name of value
   */
  get: <T = unknown>(key: string) => Promise<T | undefined>;
  /**
   * Get all settings values
   */
  getAll: () => Promise<Record<string, unknown>>;
  /**
   * Set a setting value
   * @param key name of value
   * @param value value to set
   */
  set: <T = unknown>(key: string, value: T) => Promise<void>;
  /**
   * Remove a setting value
   * @param key name of value
   */
  remove: (key: string) => Promise<void>;
}

/**
 * Saved objects common find args
 * @public
 */
export interface SavedObjectsClientCommonFindArgs {
  /**
   * Saved object fields
   */
  fields?: string[];
  /**
   * Results per page
   */
  perPage?: number;
  /**
   * Query string
   */
  search?: string;
  /**
   * Fields to search
   */
  searchFields?: string[];
}

/**
 * Common interface for the saved objects client on server and content management in browser
 * @public
 */
export interface PersistenceAPI {
  /**
   * Search for saved objects
   * @param options - options for search
   */
  find: (
    options: SavedObjectsClientCommonFindArgs
  ) => Promise<Array<SavedObject<DataViewAttributes>>>;
  /**
   * Get a single saved object by id
   * @param type - type of saved object
   * @param id - id of saved object
   */
  get: (id: string) => Promise<SavedObject<DataViewAttributes>>;
  /**
   * Update a saved object by id
   * @param type - type of saved object
   * @param id - id of saved object
   * @param attributes - attributes to update
   * @param options - client options
   */
  update: (
    id: string,
    attributes: DataViewAttributes,
    options: { version?: string }
  ) => Promise<SavedObject>;
  /**
   * Create a saved object
   * @param attributes - attributes to set
   * @param options - client options
   */
  create: (
    attributes: DataViewAttributes,
    // SavedObjectsCreateOptions
    options: { id?: string; initialNamespaces?: string[]; overwrite?: boolean; managed?: boolean }
  ) => Promise<SavedObject>;
  /**
   * Delete a saved object by id
   * @param type - type of saved object
   * @param id - id of saved object
   */
  delete: (id: string) => Promise<void>;
}

export interface GetFieldsOptions {
  pattern: string;
  type?: string;
  metaFields?: string[];
  rollupIndex?: string;
  allowNoIndex?: boolean;
  indexFilter?: QueryDslQueryContainer;
  includeUnmapped?: boolean;
  fields?: string[];
  allowHidden?: boolean;
  forceRefresh?: boolean;
  fieldTypes?: string[];
  includeEmptyFields?: boolean;
  abortSignal?: AbortSignal;
  runtimeMappings?: estypes.MappingRuntimeFields;
  projectRouting?: string;
}

/**
 * FieldsForWildcard response
 */
export interface FieldsForWildcardResponse {
  fields: FieldsForWildcardSpec[];
  indices: string[];
  etag?: string;
}

/**
 * Existing Indices response
 */
export type ExistingIndicesResponse = string[];

export interface IDataViewsApiClient {
  getFieldsForWildcard: (options: GetFieldsOptions) => Promise<FieldsForWildcardResponse>;
  hasUserDataView: () => Promise<boolean>;
}

export type AggregationRestrictions = Record<
  string,
  {
    agg?: string;
    interval?: number;
    fixed_interval?: string;
    calendar_interval?: string;
    delay?: string;
    time_zone?: string;
  }
>;

/**
 * Interface for metadata about rollup indices
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type TypeMeta = {
  /**
   * Aggregation restrictions for rollup fields
   */
  aggs?: Record<string, AggregationRestrictions>;
  /**
   * Params for retrieving rollup field data
   */
  params?: {
    /**
     * Rollup index name used for loading field list
     */
    rollup_index: string;
  };
};

/**
 * Data View type. Default or rollup
 */
export enum DataViewType {
  DEFAULT = 'default',
  ROLLUP = 'rollup',
}

export type FieldSpecConflictDescriptions = Record<string, string[]>;

// omit items saved DataView
type FieldsForWildcardSpec = Omit<
  FieldSpec,
  'format' | 'customLabel' | 'runtimeField' | 'count' | 'customDescription'
>;

/**
 * Serialized version of DataViewField
 * @public
 */
export type FieldSpec = DataViewFieldBase & {
  /**
   * Popularity count is used by discover
   */
  count?: number;
  /**
   * Description of field type conflicts across indices
   */
  conflictDescriptions?: Record<string, string[]>;
  /**
   * Field formatting in serialized format
   */
  format?: SerializedFieldFormat;
  /**
   * Elasticsearch field types used by backing indices
   */
  esTypes?: string[];
  /**
   * True if field is searchable
   */
  searchable: boolean;
  /**
   * True if field is aggregatable
   */
  aggregatable: boolean;
  /**
   * True if field is empty
   */
  isNull?: boolean;

  /**
   * True if field is a computed column, used in ES|QL to distinguish from index fields
   */
  isComputedColumn?: boolean;
  /**
   * True if can be read from doc values
   */
  readFromDocValues?: boolean;
  /**
   * True if field is indexed
   */
  indexed?: boolean;
  /**
   * Custom label for field, used for display in kibana
   */
  customLabel?: string;
  /**
   * Custom description for field, used for display in kibana
   */
  customDescription?: string;
  /**
   * Runtime field definition
   */
  runtimeField?: RuntimeFieldSpec;

  /**
   * list of allowed field intervals for the field
   */
  fixedInterval?: string[];

  /**
   * List of allowed timezones for the field
   */
  timeZone?: string[];

  /**
   * set to true if field is a TSDB dimension field
   */
  timeSeriesDimension?: boolean;

  /**
   * set if field is a TSDB metric field
   */
  timeSeriesMetric?: estypes.MappingTimeSeriesMetricType;

  // not persisted

  /**
   * Whether short dots are enabled, based on uiSettings.
   */
  shortDotsEnable?: boolean;
  /**
   * Is this field in the mapping? False if a scripted or runtime field defined on the data view.
   */
  isMapped?: boolean;
  /**
   * Name of parent field for composite runtime field subfields.
   */
  parentName?: string;

  defaultFormatter?: string;

  /**
   * Indicates whether the field is a metadata field.
   */
  metadata_field?: boolean;
};

export type DataViewFieldMap = Record<string, FieldSpec>;

/**
 * Static data view format
 * Serialized data object, representing data view attributes and state
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type DataViewSpec = {
  /**
   * Saved object id (or generated id if in-memory only)
   */
  id?: string;
  /**
   * Saved object version string
   */
  version?: string;
  /**
   * Contrary to its name, this property sets the index pattern of the data view. (e.g. `logs-*,metrics-*`)
   *
   * Use the `name` property instead to set a human readable name for the data view.
   */
  title?: string;
  /**
   * Name of timestamp field
   */
  timeFieldName?: string;
  /**
   * List of filters which discover uses to hide fields
   */
  sourceFilters?: SourceFilter[];
  /**
   * Map of fields by name
   */
  fields?: DataViewFieldMap;
  /**
   * Metadata about data view, only used by rollup data views
   */
  typeMeta?: TypeMeta;
  /**
   * Default or rollup
   */
  type?: string;
  /**
   * Map of serialized field formats by field name
   */
  fieldFormats?: Record<string, SerializedFieldFormat>;
  /**
   * Map of runtime fields by field name
   */
  runtimeFieldMap?: Record<string, RuntimeFieldSpec>;
  /**
   * Map of field attributes by field name, currently customName and count
   */
  fieldAttrs?: FieldAttrsAsObject;
  /**
   * Determines whether failure to load field list should be reported as error
   */
  allowNoIndex?: boolean;
  /**
   * Array of namespace ids
   */
  namespaces?: string[];
  /**
   * Human readable name used to differentiate the data view.
   */
  name?: string;
  /**
   * Allow hidden and system indices when loading field list
   */
  allowHidden?: boolean;
  /**
   * Whether the data view is managed by the application.
   */
  managed?: boolean;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SourceFilter = {
  value: string;
  clientId?: string | number;
};

export interface HasDataService {
  hasESData: () => Promise<boolean>;
  hasUserDataView: () => Promise<boolean>;
  hasDataView: () => Promise<boolean>;
}

export interface ClientConfigType {
  scriptedFieldsEnabled?: boolean;
  dataTiersExcludedForFields?: string;
  fieldListCachingEnabled?: boolean;
  hasEsDataTimeout: number;
}
