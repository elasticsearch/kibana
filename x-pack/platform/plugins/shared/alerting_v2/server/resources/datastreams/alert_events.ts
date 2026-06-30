/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingsDefinition } from '@kbn/es-mappings';
import { z } from '@kbn/zod/v4';
import type { ResourceDefinition } from './types';

export const ALERT_EVENTS_DATA_STREAM = '.rule-events';
export const ALERT_EVENTS_DATA_STREAM_VERSION = 5;
export const ALERT_EVENTS_BACKING_INDEX = '.ds-.rule-events-*';

const mappings: MappingsDefinition = {
  dynamic: false,
  properties: {
    // Document '_id' is used as the unique alert event identifier
    '@timestamp': { type: 'date' },
    scheduled_timestamp: { type: 'date' },
    rule: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        version: { type: 'long' },
      },
    },
    group_hash: { type: 'keyword' },
    data: { type: 'flattened' },
    status: { type: 'keyword' }, // breached | recovered | no_data
    source: { type: 'keyword' },
    type: { type: 'keyword' }, // signal | alert
    episode: {
      type: 'object',
      properties: {
        id: { type: 'keyword' },
        status: { type: 'keyword' }, // inactive | pending | active | recovering
        status_count: { type: 'long' }, // only set for pending and recovering
        status_started_at: { type: 'date' }, // when the current status span began
      },
    },
    // Present only on the event where episode.status changes. The `ends_*` fields
    // are a flattened, synthetics-style snapshot of the status span this event
    // closed (the strict mapping type only allows one level of object nesting,
    // so the snapshot cannot be a nested `ends` object).
    transition: {
      type: 'object',
      properties: {
        from: { type: 'keyword' }, // previous episode.status (absent on lifecycle start)
        to: { type: 'keyword' }, // new episode.status (== episode.status)
        ends_episode_id: { type: 'keyword' }, // closed span: episode id
        ends_status: { type: 'keyword' }, // closed span: status
        ends_started_at: { type: 'date' }, // closed span: when it began
        ends_duration_ms: { type: 'long' }, // closed span: how long it lasted
        ends_status_count: { type: 'long' }, // closed span: status_count, if any
      },
    },
    space_id: { type: 'keyword' },
    severity: { type: 'keyword' }, // info | low | medium | high | critical
  },
};

const alertEventStatusSchema = z.enum(['breached', 'recovered', 'no_data']);
const alertEventTypeSchema = z.enum(['signal', 'alert']);
const alertEpisodeStatusSchema = z.enum(['inactive', 'pending', 'active', 'recovering']);
const alertEpisodeStatusCountSchema = z.number().int().optional();
const alertEventSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);

export const alertEventStatus = alertEventStatusSchema.enum;
export const alertEventType = alertEventTypeSchema.enum;
export const alertEpisodeStatus = alertEpisodeStatusSchema.enum;
export const alertEventSeverity = alertEventSeveritySchema.enum;

// A flattened, synthetics-style snapshot of the status span a transition closes.
// `from`/`to` describe the change; `ends_*` describe the span that ended (absent
// on lifecycle start). Flattened (rather than a nested `ends` object) because the
// strict mapping type only allows one level of object nesting.
const alertEpisodeTransitionSchema = z.object({
  from: alertEpisodeStatusSchema.optional(),
  to: alertEpisodeStatusSchema,
  ends_episode_id: z.string().optional(),
  ends_status: alertEpisodeStatusSchema.optional(),
  ends_started_at: z.string().optional(),
  ends_duration_ms: z.number().int().optional(),
  ends_status_count: z.number().int().optional(),
});

export const alertEventSchema = z.object({
  '@timestamp': z.string(),
  scheduled_timestamp: z.string().optional(),
  rule: z.object({
    id: z.string(),
    version: z.number(),
  }),
  group_hash: z.string(),
  data: z.record(z.string(), z.any()),
  status: alertEventStatusSchema,
  source: z.string(),
  type: alertEventTypeSchema,
  episode: z
    .object({
      id: z.string(),
      status: alertEpisodeStatusSchema,
      status_count: alertEpisodeStatusCountSchema,
      status_started_at: z.string().optional(),
    })
    .optional(),
  transition: alertEpisodeTransitionSchema.optional(),
  space_id: z.string(),
  severity: alertEventSeveritySchema.optional(),
});

export type AlertEvent = z.infer<typeof alertEventSchema>;
export type AlertEventStatus = z.infer<typeof alertEventStatusSchema>;
export type AlertEventType = z.infer<typeof alertEventTypeSchema>;
export type AlertEpisodeStatus = z.infer<typeof alertEpisodeStatusSchema>;
export type AlertEventSeverity = z.infer<typeof alertEventSeveritySchema>;
export type AlertEpisodeTransition = z.infer<typeof alertEpisodeTransitionSchema>;

export const getAlertEventsResourceDefinition = (): ResourceDefinition => ({
  key: `data_stream:${ALERT_EVENTS_DATA_STREAM}`,
  dataStreamName: ALERT_EVENTS_DATA_STREAM,
  version: ALERT_EVENTS_DATA_STREAM_VERSION,
  mappings,
  lifecycle: {},
});
