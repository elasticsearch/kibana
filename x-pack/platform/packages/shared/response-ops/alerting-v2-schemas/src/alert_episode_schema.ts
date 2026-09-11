/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ALERT_EPISODE_STATUS } from './alert_action_schema';
import { tagsSchema } from './common';
import { ID_MAX_LENGTH, MAX_FINGERPRINT_LENGTH } from './constants';

export const alertEpisodeStatusSchema = z.union([
  z.literal(ALERT_EPISODE_STATUS.INACTIVE).describe('The alert episode is fully recovered'),
  z
    .literal(ALERT_EPISODE_STATUS.PENDING)
    .describe('Breached but below the consecutive-breaches threshold'),
  z.literal(ALERT_EPISODE_STATUS.ACTIVE).describe('Met the threshold — alert is firing'),
  z
    .literal(ALERT_EPISODE_STATUS.RECOVERING)
    .describe('Breach stopped but recovery condition is not yet met'),
]);

/**
 * Canonical AlertEpisode row shape (dotted ES|QL keys).
 * Nullable fields match what query / client normalization may return.
 */
export const alertEpisodeSchema = z
  .object({
    '@timestamp': z.iso.datetime(),
    'episode.id': z.string().min(1).max(ID_MAX_LENGTH),
    'episode.status': alertEpisodeStatusSchema,
    'rule.id': z.string().min(1).max(ID_MAX_LENGTH),
    group_hash: z.string().min(1).max(MAX_FINGERPRINT_LENGTH),
    first_timestamp: z.iso.datetime(),
    last_timestamp: z.iso.datetime(),
    duration: z.number(),
    /**
     * True when the query did not see the episode's first event, i.e. the
     * episode started before the selected time range, so `duration` and
     * `first_timestamp` only cover the part inside the range.
     */
    duration_is_lower_bound: z.boolean().nullable().optional(),
    /** ISO timestamp of the first event where episode.status === 'active'. */
    triggered_at: z.iso.datetime().nullable().optional(),
    last_ack_action: z.enum(['ack', 'unack']).nullable().optional(),
    last_assignee_uid: z.string().min(1).max(ID_MAX_LENGTH).nullable().optional(),
    last_snooze_action: z.enum(['snooze', 'unsnooze']).nullable().optional(),
    snooze_expiry: z.iso.datetime().nullable().optional(),
    last_tags: tagsSchema.nullable().optional(),
    /** JSON string from the latest non-empty alert `data`. */
    episode_data: z.string().nullable().optional(),
    /** Latest top-level `severity` from a breached rule event, when present. */
    severity: z.string().min(1).nullable().optional(),
  })
  .strict();

export type AlertEpisode = z.infer<typeof alertEpisodeSchema>;
