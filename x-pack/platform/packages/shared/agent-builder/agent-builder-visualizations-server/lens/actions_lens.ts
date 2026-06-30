/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { VisualizationConfig } from './types';

export interface GenerateEsqlAction {
  type: 'generate_esql';
  success: boolean;
  query?: string;
  error?: string;
}

export interface GenerateConfigAction {
  type: 'generate_config';
  success: boolean;
  config?: any; // Can be any shape - gets validated in ValidateConfigAction
  attempt: number;
  error?: string;
}

export interface ValidateConfigAction {
  type: 'validate_config';
  success: boolean;
  config?: VisualizationConfig;
  attempt: number;
  error?: string;
}

export interface GenerateTimeRangeAction {
  type: 'generate_time_range';
  success: boolean;
  timeRange?: { from: string; to: string };
  error?: string;
}

export type Action =
  | GenerateEsqlAction
  | GenerateConfigAction
  | ValidateConfigAction
  | GenerateTimeRangeAction;

export function isGenerateConfigAction(action: Action): action is GenerateConfigAction {
  return action.type === 'generate_config';
}

export function isValidateConfigAction(action: Action): action is ValidateConfigAction {
  return action.type === 'validate_config';
}

export function isGenerateTimeRangeAction(action: Action): action is GenerateTimeRangeAction {
  return action.type === 'generate_time_range';
}

// Node name constants
export const GENERATE_ESQL_NODE = 'generate_esql_query';
export const GENERATE_CONFIG_NODE = 'generate_config';
export const VALIDATE_CONFIG_NODE = 'validate_config';
export const GENERATE_TIME_RANGE_NODE = 'generate_time_range';

// Configuration constants
export const MAX_RETRY_ATTEMPTS = 5;
