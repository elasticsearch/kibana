/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// For a single episode, seed the flyout from `last_tags`. For multiple selections, start empty
// (no single "current" set when replacing tags across groups).

import type { HttpStart } from '@kbn/core-http-browser';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { QueryClient } from '@kbn/react-query';
import type { BulkTagSeriesActionItem } from '@kbn/alerting-v2-schemas';
import type { EpisodeAction, EpisodeActionContext } from './types';
import { bulkTagSeriesActions } from './bulk_create_alert_actions';
import { uniqueByGroup, successOrPartialToast } from './helpers';
import * as i18n from './translations';
import { openTagsFlyout } from '../components/tags_flyout';

export interface EditTagsActionDeps {
  http: HttpStart;
  overlays: OverlayStart;
  notifications: NotificationsStart;
  rendering: CoreStart['rendering'];
  expressions: ExpressionsStart;
  spaces: SpacesPluginStart;
  queryClient: QueryClient;
}

export const createEditTagsAction = (deps: EditTagsActionDeps): EpisodeAction => ({
  id: 'ALERTING_V2_EDIT_EPISODE_TAGS',
  order: 40,
  displayName: i18n.EDIT_TAGS,
  iconType: 'tag',
  isCompatible: ({ episodes }: EpisodeActionContext) => episodes.length > 0,
  execute: async ({ episodes, onSuccess }: EpisodeActionContext) => {
    const currentTags = episodes.length === 1 ? episodes[0].last_tags ?? [] : [];
    const tags = await openTagsFlyout(deps.overlays, deps.rendering, currentTags, {
      expressions: deps.expressions,
      spaces: deps.spaces,
      queryClient: deps.queryClient,
    });
    if (tags == null) return;

    const items: BulkTagSeriesActionItem[] = uniqueByGroup(episodes).map((ep) => ({
      group_hash: ep.group_hash,
      tags,
    }));
    if (!items.length) return;

    try {
      const response = await bulkTagSeriesActions(deps.http, items);
      deps.notifications.toasts.add(successOrPartialToast(response));
      onSuccess?.();
    } catch {
      deps.notifications.toasts.addDanger(i18n.BULK_ERROR_TOAST);
    }
  },
});
