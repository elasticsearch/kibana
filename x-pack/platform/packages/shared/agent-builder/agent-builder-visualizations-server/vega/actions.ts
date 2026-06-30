/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsqlEsqlColumnInfo } from '@elastic/elasticsearch/lib/api/types';

export interface GenerateEsqlAction {
  type: 'generate_esql';
  success: boolean;
  query?: string;
  /** Result columns of the executed query, used to inform spec authoring/validation. */
  columns?: EsqlEsqlColumnInfo[];
  error?: string;
}

export interface AuthorSpecAction {
  type: 'author_spec';
  success: boolean;
  /** Raw spec object parsed from the model response; shape is validated later. */
  spec?: Record<string, unknown>;
  attempt: number;
  error?: string;
}

/** Action recording the outcome of normalizing + render-validating a spec. */
export interface ValidateSpecAction {
  type: 'validate_spec';
  success: boolean;
  /** The finalized, render-ready spec serialized as the string the embeddable expects. */
  spec?: string;
  attempt: number;
  error?: string;
  /** Non-fatal Vega warnings surfaced as soft feedback to later attempts. */
  warnings?: string[];
}

export type VegaAction = GenerateEsqlAction | AuthorSpecAction | ValidateSpecAction;

export const isGenerateEsqlAction = (action: VegaAction): action is GenerateEsqlAction =>
  action.type === 'generate_esql';

export const isAuthorSpecAction = (action: VegaAction): action is AuthorSpecAction =>
  action.type === 'author_spec';

export const isValidateSpecAction = (action: VegaAction): action is ValidateSpecAction =>
  action.type === 'validate_spec';

// Node name constants
export const GENERATE_ESQL_NODE = 'generate_esql_query';
export const AUTHOR_SPEC_NODE = 'author_spec';
export const VALIDATE_SPEC_NODE = 'validate_spec';
export const FINALIZE_NODE = 'finalize';

// Configuration constants
export const MAX_RETRY_ATTEMPTS = 3;
