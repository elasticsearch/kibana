/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Name of the datastream in elasticsearch
 */
export const DATA_STREAM_NAME = '.kibana_change_history';
/**
 * Separator char. Used for scoping.
 */
export const SEPARATOR_CHAR = '|';
/**
 * The version of ECS used
 * @see https://www.elastic.co/docs/reference/ecs/ecs-field-reference
 */
export const ECS_VERSION = '9.3.0';
/**
 * The default size of results when getting history.
 */
export const DEFAULT_RESULT_SIZE = 100;
/**
 * Default maximum number of buckets returned per field by {@link ChangeHistoryClient.getHistoryByFields}.
 */
export const DEFAULT_FIELD_AGGREGATION_SIZE = 100;
