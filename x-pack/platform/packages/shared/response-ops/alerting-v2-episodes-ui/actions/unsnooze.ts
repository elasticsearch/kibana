/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { BulkUnsnoozeSeriesActionItem } from '@kbn/alerting-v2-schemas';
import type { EpisodeAction, EpisodeActionContext } from './types';
import { bulkUnsnoozeSeriesActions } from './bulk_create_alert_actions';
import { uniqueByGroup, successOrPartialToast } from './helpers';
import * as i18n from './translations';
import { isEpisodeSnoozed } from '../utils/is_episode_snoozed';

export interface UnsnoozeActionDeps {
  http: HttpStart;
  notifications: NotificationsStart;
}

export const createUnsnoozeAction = (deps: UnsnoozeActionDeps): EpisodeAction => ({
  id: 'ALERTING_V2_UNSNOOZE_EPISODE',
  order: 21,
  displayName: i18n.UNSNOOZE,
  iconType: 'bell',
  isCompatible: ({ episodes }: EpisodeActionContext) =>
    episodes.length > 0 &&
    episodes.some((ep) => isEpisodeSnoozed(ep.last_snooze_action, ep.snooze_expiry)),
  execute: async ({ episodes, onSuccess }: EpisodeActionContext) => {
    const items: BulkUnsnoozeSeriesActionItem[] = uniqueByGroup(episodes).map((ep) => ({
      group_hash: ep.group_hash,
    }));
    if (!items.length) return;

    try {
      const response = await bulkUnsnoozeSeriesActions(deps.http, items);
      deps.notifications.toasts.add(successOrPartialToast(response));
      onSuccess?.();
    } catch {
      deps.notifications.toasts.addDanger(i18n.BULK_ERROR_TOAST);
    }
  },
});
