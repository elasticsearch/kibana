/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { HttpStart } from '@kbn/core-http-browser';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { OverlayStart } from '@kbn/core-overlays-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { DocLinksStart } from '@kbn/core-doc-links-browser';
import type { QueryClient } from '@kbn/react-query';
import type { AlertEpisode } from '@kbn/alerting-v2-schemas';
import type { BulkAssignEpisodeActionItem } from '@kbn/alerting-v2-schemas';
import type { EpisodeAction, EpisodeActionContext, EpisodeActionMenuItemContext } from './types';
import { bulkAssignEpisodeActions } from './bulk_create_alert_actions';
import { successOrPartialToast } from './helpers';
import * as i18n from './translations';
import { openAssigneeModal } from '../components/assignee_modal';
import { EditEpisodeAssigneePopoverItem } from '../components/actions/edit_episode_assignee_popover_item';

export const EDIT_EPISODE_ASSIGNEE_ACTION_ID = 'ALERTING_V2_EDIT_EPISODE_ASSIGNEE';

export interface EditAssigneeActionDeps {
  http: HttpStart;
  overlays: OverlayStart;
  notifications: NotificationsStart;
  rendering: CoreStart['rendering'];
  userProfile: UserProfileService;
  docLinks: DocLinksStart;
  queryClient: QueryClient;
}

/**
 * For a single-episode invocation, pre-populate the picker with the episode's
 * current assignee. For bulk, leave it blank — there's no shared "current"
 * value across the selection.
 */
const getCurrentAssigneeUid = (episodes: AlertEpisode[]): string | null =>
  episodes.length === 1 ? episodes[0].last_assignee_uid ?? null : null;

const applyAssignee = async (
  deps: EditAssigneeActionDeps,
  { episodes, onSuccess }: EpisodeActionContext,
  assigneeUid: string | null
) => {
  const items: BulkAssignEpisodeActionItem[] = episodes.map((episode) => ({
    episode_id: episode['episode.id'],
    assignee_uid: assigneeUid,
  }));
  if (!items.length) return;

  try {
    const response = await bulkAssignEpisodeActions(deps.http, items);
    deps.notifications.toasts.add(successOrPartialToast(response));
    onSuccess?.();
  } catch {
    deps.notifications.toasts.addDanger(i18n.BULK_ERROR_TOAST);
  }
};

export const createEditAssigneeAction = (deps: EditAssigneeActionDeps): EpisodeAction => ({
  id: EDIT_EPISODE_ASSIGNEE_ACTION_ID,
  order: 50,
  displayName: i18n.EDIT_ASSIGNEE,
  iconType: 'user',
  isCompatible: ({ episodes }: EpisodeActionContext) => episodes.length > 0,
  renderMenuItem: ({ episodes, onSuccess, closeMenu }: EpisodeActionMenuItemContext) => (
    <EditEpisodeAssigneePopoverItem
      assigneeUid={getCurrentAssigneeUid(episodes)}
      episodeCount={episodes.length}
      label={i18n.EDIT_ASSIGNEE}
      iconType="user"
      closeMenu={closeMenu}
      onApply={(uid) => applyAssignee(deps, { episodes, onSuccess }, uid)}
    />
  ),
  execute: async (ctx: EpisodeActionContext) => {
    const result = await openAssigneeModal(
      deps.overlays,
      deps.rendering,
      {
        queryClient: deps.queryClient,
        kibanaServices: {
          notifications: deps.notifications,
          userProfile: deps.userProfile,
          docLinks: deps.docLinks,
        },
      },
      { assigneeUid: getCurrentAssigneeUid(ctx.episodes), episodeCount: ctx.episodes.length }
    );
    // `undefined` means dismissed; `null` means "clear assignee".
    if (result === undefined) return;

    await applyAssignee(deps, ctx, result);
  },
});
