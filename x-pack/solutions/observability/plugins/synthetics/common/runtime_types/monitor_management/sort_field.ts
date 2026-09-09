/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import { ConfigKey } from '../../constants/monitor_management';

export const MonitorSortFieldSchema = schema.maybe(
  schema.oneOf([
    schema.literal('enabled'),
    schema.literal('status'),
    schema.literal('updated_at'),
    schema.literal('created_at'),
    schema.literal('urls'),
    schema.literal(`${ConfigKey.NAME}.keyword`),
    schema.literal(`${ConfigKey.TAGS}.keyword`),
    schema.literal(`${ConfigKey.PROJECT_ID}.keyword`),
    schema.literal(`${ConfigKey.MONITOR_TYPE}.keyword`),
    schema.literal(`${ConfigKey.SCHEDULE}.keyword`),
    schema.literal(ConfigKey.JOURNEY_ID),
  ])
);

export type MonitorListSortField = TypeOf<typeof MonitorSortFieldSchema>;

/** Sort fields the overview status route actually applies in `sortConfigs`. */
export const OverviewStatusSortFieldSchema = schema.maybe(
  schema.oneOf([
    schema.literal('status'),
    schema.literal('updated_at'),
    schema.literal('urls'),
    schema.literal(`${ConfigKey.NAME}.keyword`),
    schema.literal(`${ConfigKey.MONITOR_TYPE}.keyword`),
  ])
);
