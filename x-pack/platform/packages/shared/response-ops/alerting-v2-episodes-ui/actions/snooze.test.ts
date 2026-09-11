/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { overlayServiceMock } from '@kbn/core-overlays-browser-mocks';
import { renderingServiceMock } from '@kbn/core-rendering-browser-mocks';
import { createSnoozeAction } from './snooze';
import * as modal from '../components/snooze_expiry_modal';
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
  overlays: overlayServiceMock.createStartContract(),
  notifications: notificationServiceMock.createStartContract(),
  rendering: renderingServiceMock.create(),
});

describe('createSnoozeAction', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('compatible when at least one episode is not snoozed', () => {
    expect(
      createSnoozeAction(makeDeps()).isCompatible({
        episodes: [makeEpisode({ last_snooze_action: 'unsnooze' })],
      })
    ).toBe(true);
  });

  it('not compatible when every episode is already snoozed', () => {
    expect(
      createSnoozeAction(makeDeps()).isCompatible({
        episodes: [makeEpisode({ last_snooze_action: 'snooze' })],
      })
    ).toBe(false);
  });

  it('compatible when snooze has expired', () => {
    expect(
      createSnoozeAction(makeDeps()).isCompatible({
        episodes: [
          makeEpisode({
            last_snooze_action: 'snooze',
            snooze_expiry: '2020-01-01T00:00:00.000Z',
          }),
        ],
      })
    ).toBe(true);
  });

  it('not compatible on empty selection', () => {
    expect(createSnoozeAction(makeDeps()).isCompatible({ episodes: [] })).toBe(false);
  });

  it('execute: opens modal, POSTs unique-by-group SNOOZE items, toasts, calls onSuccess', async () => {
    const deps = makeDeps();
    jest.spyOn(modal, 'openSnoozeExpiryModal').mockResolvedValue('2026-05-01T00:00:00Z');
    jest
      .spyOn(bulk, 'bulkSnoozeSeriesActions')
      .mockResolvedValue({ affected_count: 1, errors: [] });
    const onSuccess = jest.fn();
    await createSnoozeAction(deps).execute({
      episodes: [makeEpisode(), makeEpisode({ 'episode.id': 'e2' })],
      onSuccess,
    });
    expect(bulk.bulkSnoozeSeriesActions).toHaveBeenCalledWith(deps.http, [
      { group_hash: 'g1', expiry: '2026-05-01T00:00:00Z' },
    ]);
    expect(deps.notifications.toasts.add).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('execute: cancelled modal is a no-op', async () => {
    const deps = makeDeps();
    jest.spyOn(modal, 'openSnoozeExpiryModal').mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    await createSnoozeAction(deps).execute({ episodes: [makeEpisode()], onSuccess });
    expect(deps.http.post).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
