/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { createUnackAction } from './unack';
import * as bulk from './bulk_create_alert_actions';
import type { AlertEpisode } from '@kbn/alerting-v2-schemas';
const makeEpisode = (overrides: Partial<AlertEpisode> = {}): AlertEpisode => ({
  '@timestamp': '2026-04-23T00:00:00Z',
  'episode.id': 'e1',
  'episode.status': 'active' as any,
  'rule.id': 'r1',
  group_hash: 'g1',
  first_timestamp: '2026-04-23T00:00:00Z',
  last_timestamp: '2026-04-23T00:00:00Z',
  duration: 0,
  ...overrides,
});

const makeDeps = () => ({
  http: httpServiceMock.createStartContract(),
  notifications: notificationServiceMock.createStartContract(),
});

describe('createUnackAction', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('compatible when at least one episode is acked', () => {
    expect(
      createUnackAction(makeDeps()).isCompatible({
        episodes: [makeEpisode({ last_ack_action: 'ack' })],
      })
    ).toBe(true);
  });

  it('not compatible when no episode is acked', () => {
    expect(
      createUnackAction(makeDeps()).isCompatible({
        episodes: [makeEpisode({ last_ack_action: 'unack' })],
      })
    ).toBe(false);
  });

  it('not compatible when no episode has an ack action', () => {
    expect(
      createUnackAction(makeDeps()).isCompatible({
        episodes: [makeEpisode()],
      })
    ).toBe(false);
  });

  it('not compatible on empty selection', () => {
    expect(createUnackAction(makeDeps()).isCompatible({ episodes: [] })).toBe(false);
  });

  it('execute: POSTs per-episode UNACK items with distinct episode_ids, toasts, calls onSuccess', async () => {
    const deps = makeDeps();
    jest
      .spyOn(bulk, 'bulkUnackEpisodeActions')
      .mockResolvedValue({ affected_count: 2, errors: [] });
    const onSuccess = jest.fn();
    await createUnackAction(deps).execute({
      episodes: [
        makeEpisode({ 'episode.id': 'e1', group_hash: 'g1', last_ack_action: 'ack' }),
        makeEpisode({ 'episode.id': 'e2', group_hash: 'g1', last_ack_action: 'ack' }),
      ],
      onSuccess,
    });
    expect(bulk.bulkUnackEpisodeActions).toHaveBeenCalledWith(deps.http, [
      { episode_id: 'e1' },
      { episode_id: 'e2' },
    ]);
    expect(deps.notifications.toasts.add).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('execute: error path calls notifications.toasts.addDanger with BULK_ERROR_TOAST', async () => {
    const deps = makeDeps();
    jest.spyOn(bulk, 'bulkUnackEpisodeActions').mockRejectedValue(new Error('network error'));
    const onSuccess = jest.fn();
    await createUnackAction(deps).execute({
      episodes: [makeEpisode({ last_ack_action: 'ack' })],
      onSuccess,
    });
    expect(deps.notifications.toasts.addDanger).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
