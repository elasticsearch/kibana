/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  bulkAckEpisodeActionBodySchema,
  bulkActivateEpisodeActionBodySchema,
  bulkAssignEpisodeActionBodySchema,
  bulkDeactivateEpisodeActionBodySchema,
  bulkResponseSchema,
  bulkSnoozeSeriesActionBodySchema,
  bulkTagSeriesActionBodySchema,
  bulkUnackEpisodeActionBodySchema,
  bulkUnsnoozeSeriesActionBodySchema,
  createAckEpisodeActionBodySchema,
  createActivateEpisodeActionBodySchema,
  createAssignEpisodeActionBodySchema,
  createDeactivateEpisodeActionBodySchema,
  createSnoozeSeriesActionBodySchema,
  createTagSeriesActionBodySchema,
  createUnackEpisodeActionBodySchema,
  createUnsnoozeSeriesActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import {
  BULK_TAG_SERIES_ACTION_REQUEST,
  BULK_TAG_SERIES_ACTION_RESPONSE,
} from './series/bulk_tag_series_action_oas_example';
import { BULK_SNOOZE_SERIES_ACTION_REQUEST } from './series/bulk_snooze_series_action_oas_example';
import { BULK_UNSNOOZE_SERIES_ACTION_REQUEST } from './series/bulk_unsnooze_series_action_oas_example';
import { CREATE_TAG_SERIES_ACTION_REQUEST } from './series/create_tag_series_action_oas_example';
import { CREATE_SNOOZE_SERIES_ACTION_REQUEST } from './series/create_snooze_series_action_oas_example';
import { CREATE_UNSNOOZE_SERIES_ACTION_REQUEST } from './series/create_unsnooze_series_action_oas_example';
import {
  BULK_ACK_EPISODE_ACTION_REQUEST,
  BULK_ACK_EPISODE_ACTION_RESPONSE,
} from './episodes/bulk_ack_episode_action_oas_example';
import { BULK_UNACK_EPISODE_ACTION_REQUEST } from './episodes/bulk_unack_episode_action_oas_example';
import { BULK_ASSIGN_EPISODE_ACTION_REQUEST } from './episodes/bulk_assign_episode_action_oas_example';
import { BULK_ACTIVATE_EPISODE_ACTION_REQUEST } from './episodes/bulk_activate_episode_action_oas_example';
import { BULK_DEACTIVATE_EPISODE_ACTION_REQUEST } from './episodes/bulk_deactivate_episode_action_oas_example';
import { CREATE_ACK_EPISODE_ACTION_REQUEST } from './episodes/create_ack_episode_action_oas_example';
import { CREATE_UNACK_EPISODE_ACTION_REQUEST } from './episodes/create_unack_episode_action_oas_example';
import { CREATE_ASSIGN_EPISODE_ACTION_REQUEST } from './episodes/create_assign_episode_action_oas_example';
import { CREATE_ACTIVATE_EPISODE_ACTION_REQUEST } from './episodes/create_activate_episode_action_oas_example';
import { CREATE_DEACTIVATE_EPISODE_ACTION_REQUEST } from './episodes/create_deactivate_episode_action_oas_example';

describe('alert action OAS example payloads', () => {
  it('keeps tag request example valid against createTagSeriesActionBodySchema', () => {
    expect(
      createTagSeriesActionBodySchema.safeParse(CREATE_TAG_SERIES_ACTION_REQUEST).success
    ).toBe(true);
  });

  it('keeps snooze request example valid against createSnoozeSeriesActionBodySchema', () => {
    expect(
      createSnoozeSeriesActionBodySchema.safeParse(CREATE_SNOOZE_SERIES_ACTION_REQUEST).success
    ).toBe(true);
  });

  it('keeps unsnooze request example valid against createUnsnoozeSeriesActionBodySchema', () => {
    expect(
      createUnsnoozeSeriesActionBodySchema.safeParse(CREATE_UNSNOOZE_SERIES_ACTION_REQUEST).success
    ).toBe(true);
  });

  it('keeps ack request example valid against createAckEpisodeActionBodySchema', () => {
    expect(
      createAckEpisodeActionBodySchema.safeParse(CREATE_ACK_EPISODE_ACTION_REQUEST).success
    ).toBe(true);
  });

  it('keeps unack request example valid against createUnackEpisodeActionBodySchema', () => {
    expect(
      createUnackEpisodeActionBodySchema.safeParse(CREATE_UNACK_EPISODE_ACTION_REQUEST).success
    ).toBe(true);
  });

  it('keeps assign request example valid against createAssignEpisodeActionBodySchema', () => {
    expect(
      createAssignEpisodeActionBodySchema.safeParse(CREATE_ASSIGN_EPISODE_ACTION_REQUEST).success
    ).toBe(true);
  });

  it('keeps activate request example valid against createActivateEpisodeActionBodySchema', () => {
    expect(
      createActivateEpisodeActionBodySchema.safeParse(CREATE_ACTIVATE_EPISODE_ACTION_REQUEST)
        .success
    ).toBe(true);
  });

  it('keeps deactivate request example valid against createDeactivateEpisodeActionBodySchema', () => {
    expect(
      createDeactivateEpisodeActionBodySchema.safeParse(CREATE_DEACTIVATE_EPISODE_ACTION_REQUEST)
        .success
    ).toBe(true);
  });

  it('keeps every bulk request example valid against its body schema', () => {
    const cases: Array<[{ safeParse: (v: unknown) => { success: boolean } }, unknown]> = [
      [bulkTagSeriesActionBodySchema, BULK_TAG_SERIES_ACTION_REQUEST],
      [bulkSnoozeSeriesActionBodySchema, BULK_SNOOZE_SERIES_ACTION_REQUEST],
      [bulkUnsnoozeSeriesActionBodySchema, BULK_UNSNOOZE_SERIES_ACTION_REQUEST],
      [bulkAckEpisodeActionBodySchema, BULK_ACK_EPISODE_ACTION_REQUEST],
      [bulkUnackEpisodeActionBodySchema, BULK_UNACK_EPISODE_ACTION_REQUEST],
      [bulkAssignEpisodeActionBodySchema, BULK_ASSIGN_EPISODE_ACTION_REQUEST],
      [bulkActivateEpisodeActionBodySchema, BULK_ACTIVATE_EPISODE_ACTION_REQUEST],
      [bulkDeactivateEpisodeActionBodySchema, BULK_DEACTIVATE_EPISODE_ACTION_REQUEST],
    ];

    for (const [schema, example] of cases) {
      expect(schema.safeParse(example).success).toBe(true);
    }
  });

  it('keeps the bulk response examples valid against bulkResponseSchema', () => {
    expect(bulkResponseSchema.safeParse(BULK_TAG_SERIES_ACTION_RESPONSE).success).toBe(true);
    expect(bulkResponseSchema.safeParse(BULK_ACK_EPISODE_ACTION_RESPONSE).success).toBe(true);
  });
});
