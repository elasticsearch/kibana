/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const SERVICE_MAP_ATTACHMENT_TYPE = 'observability.service-map' as const;

// Upper bound on free-form string inputs to avoid unbounded-string DoS (CodeQL).
const MAX_LABEL_LENGTH = 1024;

const serviceNodeSchema = z.object({
  'service.name': z.string().max(MAX_LABEL_LENGTH),
  'agent.name': z.string().max(MAX_LABEL_LENGTH).optional(),
});

const externalNodeSchema = z.object({
  'span.destination.service.resource': z.string().max(MAX_LABEL_LENGTH),
  // `span.type` and `span.subtype` are optional: real exit-span data frequently
  // omits the subtype (and occasionally the type). They only drive the dependency
  // node icon, so a missing value degrades gracefully. Keeping them required here
  // would reject the entire topology and prevent the map from rendering.
  'span.type': z.string().max(MAX_LABEL_LENGTH).optional(),
  'span.subtype': z.string().max(MAX_LABEL_LENGTH).optional(),
});

const nodeSchema = z.union([serviceNodeSchema, externalNodeSchema]);

const connectionMetricsSchema = z
  .object({
    errorRate: z.number().optional(),
    latencyMs: z.number().optional(),
    throughputPerMin: z.number().optional(),
  })
  .optional();

const connectionSchema = z.object({
  source: nodeSchema,
  target: nodeSchema,
  metrics: connectionMetricsSchema,
});

/**
 * Per-service badge metadata injected at the top level so each service's
 * state is set once regardless of how many connections it participates in.
 * Keys are `service.name` values; missing entries mean no badges are shown.
 */
const serviceNodeMetadataSchema = z.object({
  alertsCount: z.number().optional(),
  /**
   * Worst SLO status for the service. `'violated'` and `'degrading'` render a
   * badge; the rest do not. Values mirror the APM `SloStatus` type plus the
   * `'noSLOs'` sentinel used when a service has no SLOs configured.
   */
  sloStatus: z.enum(['violated', 'degrading', 'noData', 'healthy', 'noSLOs']).optional(),
  sloCount: z.number().optional(),
});

export const serviceMapAttachmentDataSchema = z.object({
  connections: z.array(connectionSchema),
  /**
   * Optional badge metadata keyed by `service.name`.
   * Separating this from the connection topology avoids duplicating per-service
   * state across every connection that service participates in.
   */
  nodeMetadata: z.record(z.string().max(MAX_LABEL_LENGTH), serviceNodeMetadataSchema).optional(),
  serviceName: z.string().max(MAX_LABEL_LENGTH).optional(),
  title: z.string().max(MAX_LABEL_LENGTH).optional(),
});

export type ServiceNodeMetadata = z.infer<typeof serviceNodeMetadataSchema>;

export type ServiceMapAttachmentData = z.infer<typeof serviceMapAttachmentDataSchema>;
