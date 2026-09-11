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
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import { QueryClient } from '@kbn/react-query';
import { createEditTagsAction } from './edit_tags';
import * as flyout from '../components/tags_flyout';
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
  expressions: expressionsPluginMock.createStartContract(),
  spaces: spacesPluginMock.createStartContract(),
  queryClient: new QueryClient(),
});

describe('createEditTagsAction', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('compatible when episodes.length > 0', () => {
    expect(createEditTagsAction(makeDeps()).isCompatible({ episodes: [makeEpisode()] })).toBe(true);
  });

  it('not compatible on empty selection', () => {
    expect(createEditTagsAction(makeDeps()).isCompatible({ episodes: [] })).toBe(false);
  });

  it('execute: cancelled flyout (resolves undefined) is a no-op', async () => {
    const deps = makeDeps();
    jest.spyOn(flyout, 'openTagsFlyout').mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    await createEditTagsAction(deps).execute({ episodes: [makeEpisode()], onSuccess });
    expect(deps.http.post).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('execute: opens flyout, POSTs deduped TAG items with tags array, toasts, calls onSuccess', async () => {
    const deps = makeDeps();
    jest.spyOn(flyout, 'openTagsFlyout').mockResolvedValue(['alpha', 'beta']);
    jest.spyOn(bulk, 'bulkTagSeriesActions').mockResolvedValue({ affected_count: 1, errors: [] });
    const onSuccess = jest.fn();

    await createEditTagsAction(deps).execute({
      // Two episodes in the same group — only one TAG item should be posted
      episodes: [
        makeEpisode({ 'episode.id': 'e1', group_hash: 'g1' }),
        makeEpisode({ 'episode.id': 'e2', group_hash: 'g1' }),
      ],
      onSuccess,
    });

    expect(flyout.openTagsFlyout).toHaveBeenCalledWith(deps.overlays, deps.rendering, [], {
      expressions: deps.expressions,
      spaces: deps.spaces,
      queryClient: deps.queryClient,
    });
    expect(bulk.bulkTagSeriesActions).toHaveBeenCalledWith(deps.http, [
      { group_hash: 'g1', tags: ['alpha', 'beta'] },
    ]);
    expect(deps.notifications.toasts.add).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('execute: passes last_tags into flyout when a single episode is selected', async () => {
    const deps = makeDeps();
    jest.spyOn(flyout, 'openTagsFlyout').mockResolvedValue(['alpha']);
    jest.spyOn(bulk, 'bulkTagSeriesActions').mockResolvedValue({ affected_count: 1, errors: [] });

    await createEditTagsAction(deps).execute({
      episodes: [makeEpisode({ last_tags: ['existing', 'tags'] })],
    });

    expect(flyout.openTagsFlyout).toHaveBeenCalledWith(
      deps.overlays,
      deps.rendering,
      ['existing', 'tags'],
      {
        expressions: deps.expressions,
        spaces: deps.spaces,
        queryClient: deps.queryClient,
      }
    );
  });

  it('execute: error path calls notifications.toasts.addDanger', async () => {
    const deps = makeDeps();
    jest.spyOn(flyout, 'openTagsFlyout').mockResolvedValue(['alpha']);
    jest.spyOn(bulk, 'bulkTagSeriesActions').mockRejectedValue(new Error('network error'));
    const onSuccess = jest.fn();

    await createEditTagsAction(deps).execute({ episodes: [makeEpisode()], onSuccess });

    expect(deps.notifications.toasts.addDanger).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
