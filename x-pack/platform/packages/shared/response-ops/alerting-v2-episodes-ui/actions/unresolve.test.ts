/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import { createUnresolveAction } from './unresolve';
import * as bulk from './bulk_create_alert_actions';
import type { AlertEpisode } from '@kbn/alerting-v2-schemas';
const makeEpisode = (overrides: Partial<AlertEpisode> = {}): AlertEpisode => ({
  '@timestamp': '2026-04-23T00:00:00Z',
  'episode.id': 'e1',
  'episode.status': ALERT_EPISODE_STATUS.INACTIVE,
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

describe('createUnresolveAction', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('compatible when at least one episode is INACTIVE', () => {
    expect(
      createUnresolveAction(makeDeps()).isCompatible({
        episodes: [makeEpisode({ 'episode.status': ALERT_EPISODE_STATUS.INACTIVE })],
      })
    ).toBe(true);
  });

  it.each([
    ALERT_EPISODE_STATUS.ACTIVE,
    ALERT_EPISODE_STATUS.RECOVERING,
    ALERT_EPISODE_STATUS.PENDING,
  ] as const)('not compatible when every episode is %s', (status) => {
    expect(
      createUnresolveAction(makeDeps()).isCompatible({
        episodes: [makeEpisode({ 'episode.status': status })],
      })
    ).toBe(false);
  });

  it('not compatible on empty selection', () => {
    expect(createUnresolveAction(makeDeps()).isCompatible({ episodes: [] })).toBe(false);
  });

  it('execute: POSTs per-episode ACTIVATE items with reason, toasts, calls onSuccess', async () => {
    const deps = makeDeps();
    jest
      .spyOn(bulk, 'bulkActivateEpisodeActions')
      .mockResolvedValue({ affected_count: 2, errors: [] });
    const onSuccess = jest.fn();
    await createUnresolveAction(deps).execute({
      episodes: [makeEpisode(), makeEpisode({ 'episode.id': 'e2' })],
      onSuccess,
    });
    expect(bulk.bulkActivateEpisodeActions).toHaveBeenCalledWith(deps.http, [
      { episode_id: 'e1', reason: expect.any(String) },
      { episode_id: 'e2', reason: expect.any(String) },
    ]);
    expect(deps.notifications.toasts.add).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('execute: on a mixed selection only POSTs items for the INACTIVE episodes', async () => {
    const deps = makeDeps();
    jest
      .spyOn(bulk, 'bulkActivateEpisodeActions')
      .mockResolvedValue({ affected_count: 1, errors: [] });
    const onSuccess = jest.fn();
    await createUnresolveAction(deps).execute({
      episodes: [
        makeEpisode({ 'episode.status': ALERT_EPISODE_STATUS.INACTIVE }),
        makeEpisode({ 'episode.id': 'e2', 'episode.status': ALERT_EPISODE_STATUS.ACTIVE }),
      ],
      onSuccess,
    });
    expect(bulk.bulkActivateEpisodeActions).toHaveBeenCalledWith(deps.http, [
      { episode_id: 'e1', reason: expect.any(String) },
    ]);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('execute: a selection with no INACTIVE episodes is a no-op', async () => {
    const deps = makeDeps();
    jest.spyOn(bulk, 'bulkActivateEpisodeActions');
    const onSuccess = jest.fn();
    await createUnresolveAction(deps).execute({
      episodes: [
        makeEpisode({ 'episode.status': ALERT_EPISODE_STATUS.ACTIVE }),
        makeEpisode({ 'episode.id': 'e2', 'episode.status': ALERT_EPISODE_STATUS.RECOVERING }),
      ],
      onSuccess,
    });
    expect(bulk.bulkActivateEpisodeActions).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('execute: error path calls notifications.toasts.addDanger with BULK_ERROR_TOAST', async () => {
    const deps = makeDeps();
    jest.spyOn(bulk, 'bulkActivateEpisodeActions').mockRejectedValue(new Error('network error'));
    const onSuccess = jest.fn();
    await createUnresolveAction(deps).execute({
      episodes: [makeEpisode()],
      onSuccess,
    });
    expect(deps.notifications.toasts.addDanger).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
