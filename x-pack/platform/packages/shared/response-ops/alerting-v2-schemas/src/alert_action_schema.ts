/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { tagsSchema } from './common';
import { ID_MAX_LENGTH, MAX_BULK_ITEMS } from './constants';

export const ALERT_EPISODE_STATUS = {
  INACTIVE: 'inactive',
  PENDING: 'pending',
  ACTIVE: 'active',
  RECOVERING: 'recovering',
} as const;

export type AlertEpisodeStatus = (typeof ALERT_EPISODE_STATUS)[keyof typeof ALERT_EPISODE_STATUS];

export enum ALERT_EPISODE_ACTION_TYPE {
  ACK = 'ack',
  UNACK = 'unack',
  ASSIGN = 'assign',
  TAG = 'tag',
  SNOOZE = 'snooze',
  UNSNOOZE = 'unsnooze',
  ACTIVATE = 'activate',
  DEACTIVATE = 'deactivate',
}

export type AlertEpisodeActionType =
  (typeof ALERT_EPISODE_ACTION_TYPE)[keyof typeof ALERT_EPISODE_ACTION_TYPE];

const tagActionSchema = z
  .object({
    action_type: z.literal(ALERT_EPISODE_ACTION_TYPE.TAG).describe('Adds tags to an alert.'),
    tags: tagsSchema.describe('List of tags to add to the alert.'),
  })
  .strict()
  .meta({ id: 'alerting_tag_alert_action' });

const snoozeActionSchema = z
  .object({
    action_type: z.literal(ALERT_EPISODE_ACTION_TYPE.SNOOZE).describe('Snoozes an alert.'),
    expiry: z.iso.datetime().optional().describe('ISO datetime when snooze should expire.'),
  })
  .strict()
  .meta({ id: 'alerting_snooze_alert_action' });

const unsnoozeActionSchema = z
  .object({
    action_type: z
      .literal(ALERT_EPISODE_ACTION_TYPE.UNSNOOZE)
      .describe('Removes snooze from an alert.'),
  })
  .strict()
  .meta({ id: 'alerting_unsnooze_alert_action' });

const activateActionSchema = z
  .object({
    action_type: z.literal(ALERT_EPISODE_ACTION_TYPE.ACTIVATE).describe('Activates an alert.'),
    reason: z.string().min(1).max(1024).describe('Reason for activating the alert.'),
  })
  .strict()
  .meta({ id: 'alerting_activate_alert_action' });

const deactivateActionSchema = z
  .object({
    action_type: z.literal(ALERT_EPISODE_ACTION_TYPE.DEACTIVATE).describe('Deactivates an alert.'),
    reason: z.string().min(1).max(1024).describe('Reason for deactivating the alert.'),
  })
  .strict()
  .meta({ id: 'alerting_deactivate_alert_action' });

/**
 * Action types that target an alert series as a whole, identified by `group_hash`.
 */
export const SERIES_ALERT_ACTION_TYPES = [
  ALERT_EPISODE_ACTION_TYPE.TAG,
  ALERT_EPISODE_ACTION_TYPE.SNOOZE,
  ALERT_EPISODE_ACTION_TYPE.UNSNOOZE,
] as const;
export type SeriesAlertActionType = (typeof SERIES_ALERT_ACTION_TYPES)[number];

/**
 * Action types that target one specific episode, identified by `episode_id`.
 */
export const EPISODE_ALERT_ACTION_TYPES = [
  ALERT_EPISODE_ACTION_TYPE.ACK,
  ALERT_EPISODE_ACTION_TYPE.UNACK,
  ALERT_EPISODE_ACTION_TYPE.ASSIGN,
  ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
  ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
] as const;
export type EpisodeAlertActionType = (typeof EPISODE_ALERT_ACTION_TYPES)[number];

// Episode-scoped variants of ack/unack/assign: the target episode is addressed
// by the request path (or the bulk item key), so the body carries no episode_id.
const ackEpisodeActionSchema = z
  .object({
    action_type: z
      .literal(ALERT_EPISODE_ACTION_TYPE.ACK)
      .describe('Acknowledges an alerting episode.'),
  })
  .strict()
  .meta({ id: 'alerting_ack_episode_action' });

const unackEpisodeActionSchema = z
  .object({
    action_type: z
      .literal(ALERT_EPISODE_ACTION_TYPE.UNACK)
      .describe('Removes acknowledgement from an alerting episode.'),
  })
  .strict()
  .meta({ id: 'alerting_unack_episode_action' });

const assignEpisodeActionSchema = z
  .object({
    action_type: z
      .literal(ALERT_EPISODE_ACTION_TYPE.ASSIGN)
      .describe('Assigns an alerting episode to a user, or clears the assignee when null.'),
    assignee_uid: z
      .string()
      .max(256)
      .nullable()
      .describe(
        'User profile UID of the assignee, or null to remove the assignee from the episode.'
      ),
  })
  .strict()
  .meta({ id: 'alerting_assign_episode_action' });

export const createSeriesAlertActionBodySchema = z
  .discriminatedUnion('action_type', [tagActionSchema, snoozeActionSchema, unsnoozeActionSchema])
  .describe('Request body for creating a series-level alert action. One of: tag, snooze, unsnooze.')
  .meta({ id: 'alerting_series_alert_action' });
export type CreateSeriesAlertActionBody = z.infer<typeof createSeriesAlertActionBodySchema>;

export const createEpisodeAlertActionBodySchema = z
  .discriminatedUnion('action_type', [
    ackEpisodeActionSchema,
    unackEpisodeActionSchema,
    assignEpisodeActionSchema,
    activateActionSchema,
    deactivateActionSchema,
  ])
  .describe(
    'Request body for creating an episode-level alert action. One of: ack, unack, assign, activate, deactivate.'
  )
  .meta({ id: 'alerting_episode_alert_action' });
export type CreateEpisodeAlertActionBody = z.infer<typeof createEpisodeAlertActionBodySchema>;

export const seriesAlertActionParamsSchema = z
  .object({
    group_hash: z
      .string()
      .min(1)
      .max(256)
      .describe('Hash identifying the alert episode series to apply the action to.'),
  })
  .describe('Path parameters for series-level alert action endpoints.');
export type SeriesAlertActionParams = z.infer<typeof seriesAlertActionParamsSchema>;

export const episodeAlertActionParamsSchema = z
  .object({
    episode_id: z
      .string()
      .min(1)
      .max(ID_MAX_LENGTH)
      .describe('Identifier of the alert episode to apply the action to.'),
  })
  .describe('Path parameters for episode-level alert action endpoints.');
export type EpisodeAlertActionParams = z.infer<typeof episodeAlertActionParamsSchema>;

// Route body schemas for the series-level endpoints (action_type comes from the path).
export const createTagSeriesActionBodySchema = tagActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_tag_series_action' });
export type CreateTagSeriesActionBody = z.infer<typeof createTagSeriesActionBodySchema>;

export const createSnoozeSeriesActionBodySchema = snoozeActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_snooze_series_action' });
export type CreateSnoozeSeriesActionBody = z.infer<typeof createSnoozeSeriesActionBodySchema>;

export const createUnsnoozeSeriesActionBodySchema = unsnoozeActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_unsnooze_series_action' });
export type CreateUnsnoozeSeriesActionBody = z.infer<typeof createUnsnoozeSeriesActionBodySchema>;

// Route body schemas for the episode-level endpoints (action_type comes from the
// path, episode_id from the path parameter). Ack/unack bodies are empty objects.
export const createAckEpisodeActionBodySchema = ackEpisodeActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_ack_episode_action' });
export type CreateAckEpisodeActionBody = z.infer<typeof createAckEpisodeActionBodySchema>;

export const createUnackEpisodeActionBodySchema = unackEpisodeActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_unack_episode_action' });
export type CreateUnackEpisodeActionBody = z.infer<typeof createUnackEpisodeActionBodySchema>;

export const createAssignEpisodeActionBodySchema = assignEpisodeActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_assign_episode_action' });
export type CreateAssignEpisodeActionBody = z.infer<typeof createAssignEpisodeActionBodySchema>;

export const createActivateEpisodeActionBodySchema = activateActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_activate_episode_action' });
export type CreateActivateEpisodeActionBody = z.infer<typeof createActivateEpisodeActionBodySchema>;

export const createDeactivateEpisodeActionBodySchema = deactivateActionSchema
  .omit({ action_type: true })
  .strict()
  .meta({ id: 'alerting_new_deactivate_episode_action' });
export type CreateDeactivateEpisodeActionBody = z.infer<
  typeof createDeactivateEpisodeActionBodySchema
>;

// Bulk endpoints are verb-specific (`_bulk_tag`, `_bulk_ack`, ...) so each
// body is an `{ items: [...] }` envelope of one item shape: the single-route
// body fields plus the series/episode identifier. The envelope leaves room
// for future request-level fields (e.g. dry_run) without a breaking change.
const bulkGroupHashSchema = z
  .string()
  .min(1)
  .max(256)
  .describe('Hash identifying the alert episode series to apply the action to.');

const bulkEpisodeIdSchema = z
  .string()
  .min(1)
  .max(ID_MAX_LENGTH)
  .describe('Identifier of the alert episode to apply the action to.');

const makeBulkActionBodySchema = <TItem extends z.ZodType>(itemSchema: TItem, verb: string) =>
  z
    .object({
      items: z
        .array(itemSchema)
        .min(1, 'At least one action must be provided')
        .max(
          MAX_BULK_ITEMS,
          `Cannot process more than ${MAX_BULK_ITEMS} actions in a single request`
        )
        .describe(`List of 1 to ${MAX_BULK_ITEMS} ${verb} actions to create.`),
    })
    .strict();

export const bulkTagSeriesActionItemSchema = tagActionSchema
  .omit({ action_type: true })
  .extend({ group_hash: bulkGroupHashSchema })
  .strict()
  .meta({ id: 'alerting_bulk_tag_series_item' });
export type BulkTagSeriesActionItem = z.infer<typeof bulkTagSeriesActionItemSchema>;

export const bulkTagSeriesActionBodySchema = makeBulkActionBodySchema(
  bulkTagSeriesActionItemSchema,
  'tag'
).meta({ id: 'alerting_bulk_tag_series_request' });
export type BulkTagSeriesActionBody = z.infer<typeof bulkTagSeriesActionBodySchema>;

export const bulkSnoozeSeriesActionItemSchema = snoozeActionSchema
  .omit({ action_type: true })
  .extend({ group_hash: bulkGroupHashSchema })
  .strict()
  .meta({ id: 'alerting_bulk_snooze_series_item' });
export type BulkSnoozeSeriesActionItem = z.infer<typeof bulkSnoozeSeriesActionItemSchema>;

export const bulkSnoozeSeriesActionBodySchema = makeBulkActionBodySchema(
  bulkSnoozeSeriesActionItemSchema,
  'snooze'
).meta({ id: 'alerting_bulk_snooze_series_request' });
export type BulkSnoozeSeriesActionBody = z.infer<typeof bulkSnoozeSeriesActionBodySchema>;

export const bulkUnsnoozeSeriesActionItemSchema = unsnoozeActionSchema
  .omit({ action_type: true })
  .extend({ group_hash: bulkGroupHashSchema })
  .strict()
  .meta({ id: 'alerting_bulk_unsnooze_series_item' });
export type BulkUnsnoozeSeriesActionItem = z.infer<typeof bulkUnsnoozeSeriesActionItemSchema>;

export const bulkUnsnoozeSeriesActionBodySchema = makeBulkActionBodySchema(
  bulkUnsnoozeSeriesActionItemSchema,
  'unsnooze'
).meta({ id: 'alerting_bulk_unsnooze_series_request' });
export type BulkUnsnoozeSeriesActionBody = z.infer<typeof bulkUnsnoozeSeriesActionBodySchema>;

export const bulkAckEpisodeActionItemSchema = ackEpisodeActionSchema
  .omit({ action_type: true })
  .extend({ episode_id: bulkEpisodeIdSchema })
  .strict()
  .meta({ id: 'alerting_bulk_ack_episodes_item' });
export type BulkAckEpisodeActionItem = z.infer<typeof bulkAckEpisodeActionItemSchema>;

export const bulkAckEpisodeActionBodySchema = makeBulkActionBodySchema(
  bulkAckEpisodeActionItemSchema,
  'ack'
).meta({ id: 'alerting_bulk_ack_episodes_request' });
export type BulkAckEpisodeActionBody = z.infer<typeof bulkAckEpisodeActionBodySchema>;

export const bulkUnackEpisodeActionItemSchema = unackEpisodeActionSchema
  .omit({ action_type: true })
  .extend({ episode_id: bulkEpisodeIdSchema })
  .strict()
  .meta({ id: 'alerting_bulk_unack_episodes_item' });
export type BulkUnackEpisodeActionItem = z.infer<typeof bulkUnackEpisodeActionItemSchema>;

export const bulkUnackEpisodeActionBodySchema = makeBulkActionBodySchema(
  bulkUnackEpisodeActionItemSchema,
  'unack'
).meta({ id: 'alerting_bulk_unack_episodes_request' });
export type BulkUnackEpisodeActionBody = z.infer<typeof bulkUnackEpisodeActionBodySchema>;

export const bulkAssignEpisodeActionItemSchema = assignEpisodeActionSchema
  .omit({ action_type: true })
  .extend({ episode_id: bulkEpisodeIdSchema })
  .strict()
  .meta({ id: 'alerting_bulk_assign_episodes_item' });
export type BulkAssignEpisodeActionItem = z.infer<typeof bulkAssignEpisodeActionItemSchema>;

export const bulkAssignEpisodeActionBodySchema = makeBulkActionBodySchema(
  bulkAssignEpisodeActionItemSchema,
  'assign'
).meta({ id: 'alerting_bulk_assign_episodes_request' });
export type BulkAssignEpisodeActionBody = z.infer<typeof bulkAssignEpisodeActionBodySchema>;

export const bulkActivateEpisodeActionItemSchema = activateActionSchema
  .omit({ action_type: true })
  .extend({ episode_id: bulkEpisodeIdSchema })
  .strict()
  .meta({ id: 'alerting_bulk_activate_episodes_item' });
export type BulkActivateEpisodeActionItem = z.infer<typeof bulkActivateEpisodeActionItemSchema>;

export const bulkActivateEpisodeActionBodySchema = makeBulkActionBodySchema(
  bulkActivateEpisodeActionItemSchema,
  'activate'
).meta({ id: 'alerting_bulk_activate_episodes_request' });
export type BulkActivateEpisodeActionBody = z.infer<typeof bulkActivateEpisodeActionBodySchema>;

export const bulkDeactivateEpisodeActionItemSchema = deactivateActionSchema
  .omit({ action_type: true })
  .extend({ episode_id: bulkEpisodeIdSchema })
  .strict()
  .meta({ id: 'alerting_bulk_deactivate_episodes_item' });
export type BulkDeactivateEpisodeActionItem = z.infer<typeof bulkDeactivateEpisodeActionItemSchema>;

export const bulkDeactivateEpisodeActionBodySchema = makeBulkActionBodySchema(
  bulkDeactivateEpisodeActionItemSchema,
  'deactivate'
).meta({ id: 'alerting_bulk_deactivate_episodes_request' });
export type BulkDeactivateEpisodeActionBody = z.infer<typeof bulkDeactivateEpisodeActionBodySchema>;

/**
 * Internal item shapes consumed by the alert actions client. Routes inject
 * the fixed `action_type` of their verb into each request item before
 * calling the client, so these are not request schemas.
 */
export type BulkCreateSeriesAlertActionItemBody = CreateSeriesAlertActionBody & {
  group_hash: string;
};
export type BulkCreateEpisodeAlertActionItemBody = CreateEpisodeAlertActionBody & {
  episode_id: string;
};

/**
 * Union of every alert action body across both scopes. Used by the
 * server-side handler layer, which dispatches on `action_type` regardless
 * of the scope the action came in through.
 */
export type CreateAlertActionBody = CreateSeriesAlertActionBody | CreateEpisodeAlertActionBody;
