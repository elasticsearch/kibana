/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

/**
 * UI context captured from the APM service map page when the user starts an
 * agent conversation from there. Unlike `observability.service-map`, this
 * attachment carries no topology data — only the filters the user was viewing
 * the map with, so the agent can re-fetch live data scoped the same way.
 */
export const SERVICE_MAP_CONTEXT_ATTACHMENT_TYPE = 'observability.service-map-context' as const;

// Upper bound on free-form string inputs to avoid unbounded-string DoS (CodeQL).
const MAX_LABEL_LENGTH = 1024;

/** Cap the highlighted-services list so the attachment stays a compact context payload. */
const MAX_HIGHLIGHTED_SERVICES = 50;

export const serviceMapContextAttachmentDataSchema = z.object({
  /** Environment filter of the map view. Omitted when "All" is selected. */
  environment: z.string().max(MAX_LABEL_LENGTH).optional(),
  /** KQL filter applied to the map, if any. */
  kuery: z.string().max(MAX_LABEL_LENGTH).optional(),
  /** Raw time range of the map view; values may be datemath (e.g. `now-15m`). */
  timeRange: z.object({
    from: z.string().max(MAX_LABEL_LENGTH),
    to: z.string().max(MAX_LABEL_LENGTH),
  }),
  /** Service group the map is scoped to, if any. */
  serviceGroupId: z.string().max(MAX_LABEL_LENGTH).optional(),
  /**
   * Services the user highlighted on the map (via the `service.name` filter
   * control). When present these are the user's focus — investigate them first.
   */
  highlightedServiceNames: z
    .array(z.string().max(MAX_LABEL_LENGTH))
    .max(MAX_HIGHLIGHTED_SERVICES)
    .optional(),
});

export type ServiceMapContextAttachmentData = z.infer<typeof serviceMapContextAttachmentDataSchema>;
