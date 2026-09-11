/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { BulkSnoozeSeriesActionItem } from '@kbn/alerting-v2-schemas';
import type { EpisodeAction, EpisodeActionContext } from './types';
import { bulkSnoozeSeriesActions } from './bulk_create_alert_actions';
import { uniqueByGroup, successOrPartialToast } from './helpers';
import * as i18n from './translations';
import { openSnoozeExpiryModal } from '../components/snooze_expiry_modal';
import { isEpisodeSnoozed } from '../utils/is_episode_snoozed';

export interface SnoozeActionDeps {
  http: HttpStart;
  overlays: OverlayStart;
  notifications: NotificationsStart;
  rendering: CoreStart['rendering'];
}

export const createSnoozeAction = (deps: SnoozeActionDeps): EpisodeAction => ({
  id: 'ALERTING_V2_SNOOZE_EPISODE',
  order: 20,
  displayName: i18n.SNOOZE,
  iconType: 'bellSlash',
  isCompatible: ({ episodes }: EpisodeActionContext) =>
    episodes.length > 0 &&
    episodes.some((ep) => !isEpisodeSnoozed(ep.last_snooze_action, ep.snooze_expiry)),
  execute: async ({ episodes, onSuccess }: EpisodeActionContext) => {
    const expiry = await openSnoozeExpiryModal(deps.overlays, deps.rendering);
    if (expiry === undefined) return;

    const items: BulkSnoozeSeriesActionItem[] = uniqueByGroup(episodes).map((ep) => ({
      group_hash: ep.group_hash,
      ...(expiry === null ? {} : { expiry }),
    }));
    if (!items.length) return;

    try {
      const response = await bulkSnoozeSeriesActions(deps.http, items);
      deps.notifications.toasts.add(successOrPartialToast(response));
      onSuccess?.();
    } catch {
      deps.notifications.toasts.addDanger(i18n.BULK_ERROR_TOAST);
    }
  },
});
