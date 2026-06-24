/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import moment from 'moment';
import type { AppHeaderBadge } from '@kbn/app-header';
import {
  ALERT_EPISODE_ACTION_TYPE,
  ALERT_EPISODE_STATUS,
  type AlertEpisodeStatus,
} from '@kbn/alerting-v2-schemas';

import type { EpisodeActionState, AlertEpisodeGroupAction } from '../../types/action';

type AppHeaderBadgeColor = NonNullable<AppHeaderBadge['color']>;

const STATUS_BADGE_CONFIG: Partial<
  Record<AlertEpisodeStatus, { label: string; color: AppHeaderBadgeColor }>
> = {
  [ALERT_EPISODE_STATUS.INACTIVE]: {
    label: i18n.translate('xpack.alertingV2EpisodesUi.inactiveStatusBadgeLabel', {
      defaultMessage: 'Inactive',
    }),
    color: 'success',
  },
  [ALERT_EPISODE_STATUS.PENDING]: {
    label: i18n.translate('xpack.alertingV2EpisodesUi.pendingStatusBadgeLabel', {
      defaultMessage: 'Pending',
    }),
    color: 'warning',
  },
  [ALERT_EPISODE_STATUS.ACTIVE]: {
    label: i18n.translate('xpack.alertingV2EpisodesUi.activeStatusBadgeLabel', {
      defaultMessage: 'Active',
    }),
    color: 'danger',
  },
  [ALERT_EPISODE_STATUS.RECOVERING]: {
    label: i18n.translate('xpack.alertingV2EpisodesUi.recoveringStatusBadgeLabel', {
      defaultMessage: 'Recovering',
    }),
    color: 'primary',
  },
};

const UNKNOWN_STATUS_BADGE: { label: string; color: AppHeaderBadgeColor } = {
  label: i18n.translate('xpack.alertingV2EpisodesUi.unknownStatusBadgeLabel', {
    defaultMessage: 'Unknown',
  }),
  color: 'primary',
};

/**
 * Builds the same set of badges that `AlertEpisodeStatusBadges` renders, shaped as
 * `AppHeaderBadge[]` for the new shared AppHeader. Keep the conditions in sync with
 * the React component in `./status_badges.tsx`.
 */
export const episodeStatusToAppHeaderBadges = (
  status: AlertEpisodeStatus | undefined,
  episodeAction: EpisodeActionState | undefined,
  groupAction: AlertEpisodeGroupAction | undefined
): AppHeaderBadge[] => {
  if (!status) {
    return [];
  }

  const effectiveStatus =
    groupAction?.lastDeactivateAction === ALERT_EPISODE_ACTION_TYPE.DEACTIVATE
      ? ALERT_EPISODE_STATUS.INACTIVE
      : status;

  const statusConfig = STATUS_BADGE_CONFIG[effectiveStatus] ?? UNKNOWN_STATUS_BADGE;

  const badges: AppHeaderBadge[] = [
    {
      ...statusConfig,
      'data-test-subj': 'alertEpisodeStatusBadge',
    },
  ];

  if (groupAction?.lastSnoozeAction === ALERT_EPISODE_ACTION_TYPE.SNOOZE) {
    const expiry = groupAction.snoozeExpiry;
    badges.push({
      label: i18n.translate('xpack.alertingV2EpisodesUi.snoozedBadgeLabel', {
        defaultMessage: 'Snoozed',
      }),
      color: 'hollow',
      tooltip: expiry
        ? i18n.translate('xpack.alertingV2EpisodesUi.snoozedUntilTooltip', {
            defaultMessage: 'Notifications snoozed until {expiry}.',
            values: { expiry: moment(expiry).format('MMM D, YYYY h:mm a') },
          })
        : i18n.translate('xpack.alertingV2EpisodesUi.snoozedTooltipUnknownExpiry', {
            defaultMessage: 'Notifications are snoozed.',
          }),
      'data-test-subj': 'alertEpisodeSnoozeBadge',
    });
  }

  if (episodeAction?.lastAckAction === ALERT_EPISODE_ACTION_TYPE.ACK) {
    badges.push({
      label: i18n.translate('xpack.alertingV2EpisodesUi.acknowledgedBadgeLabel', {
        defaultMessage: 'Acknowledged',
      }),
      color: 'hollow',
      tooltip: i18n.translate('xpack.alertingV2EpisodesUi.acknowledgedTooltip', {
        defaultMessage: 'This alert is acknowledged.',
      }),
      'data-test-subj': 'alertEpisodeAckBadge',
    });
  }
  return badges;
};
