/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OptionsListDSLControlState, OptionsListSelection } from '@kbn/controls-schemas';
import type { FieldSpec, RuntimeFieldSpec } from '@kbn/data-views-plugin/common';
import type { BoolQuery, TimeRange } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';

/**
 * ----------------------------------------------------------------
 * Options list server request + response types
 * ----------------------------------------------------------------
 */

export type OptionsListSuggestions<SelectionType = OptionsListSelection> = Array<{
  value: SelectionType;
  docCount?: number;
}>;

/**
 * The Options list response is returned from the serverside Options List route.
 */
export interface OptionsListSuccessResponse {
  suggestions: OptionsListSuggestions<OptionsListSelection>;
  totalCardinality: number;
  invalidSelections?: OptionsListSelection[];
}

/**
 * The invalid selections are parsed **after** the server returns with the result from the ES client; so, the
 * suggestion aggregation parser only returns the suggestions list + the cardinality of the result
 */
export type OptionsListParsedSuggestions = Pick<
  OptionsListSuccessResponse,
  'suggestions' | 'totalCardinality'
>;

export interface OptionsListFailureResponse {
  error: 'aborted' | Error;
}

export type OptionsListResponse = OptionsListSuccessResponse | OptionsListFailureResponse;

/**
 * Serialized body for POST `/internal/controls/optionsList/fetch` — DSL (field + ES aggregations) branch.
 */
export type OptionsListDSLFetchBody = {
  kind: 'dsl';
  index: string;
} & OptionsListRequestBody;

/**
 * Serialized body for POST `/internal/controls/optionsList/fetch` — ES|QL branch.
 */
export interface OptionsListESQLFetchBody {
  kind: 'esql';
  esql: string;
  timeRange?: TimeRange;
  /** Pre-built ES DSL bool used as `params.filter` on the ES|QL `_query` endpoint to pre-filter the pipeline. */
  filter?: { bool: BoolQuery };
  sort?: OptionsListDSLControlState['sort'];
  esqlVariables?: ESQLControlVariable[];
  searchString?: string;
  searchTechnique?: OptionsListDSLControlState['search_technique'];
  selectedOptions?: OptionsListDSLControlState['selected_options'];
  ignoreValidations?: boolean;
  isReload?: boolean;
}

export type OptionsListUnifiedFetchBody = OptionsListDSLFetchBody | OptionsListESQLFetchBody;

/**
 * The Options list request body is sent to the server-side Options List route and is used to create the ES query.
 */
export interface OptionsListRequestBody {
  /** Always required for DSL aggregation requests (distinct from loose editor state typing). */
  fieldName: string;
  searchTechnique?: OptionsListDSLControlState['search_technique'];
  sort?: OptionsListDSLControlState['sort'];
  selectedOptions?: OptionsListDSLControlState['selected_options'];

  runtimeFieldMap?: Record<string, RuntimeFieldSpec>;
  ignoreValidations?: boolean;
  filters?: Array<{ bool: BoolQuery }>;
  runPastTimeout?: boolean;
  searchString?: string;
  fieldSpec?: FieldSpec;
  size: number;
  isReload?: boolean;
}
