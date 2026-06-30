/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { ALERT_EPISODE_ACTION_TYPE } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';
import { bulkCreateAlertActions } from '@kbn/alerting-v2-episodes-ui/actions';
import type { SecurityAlertEpisode } from '../hooks/use_fetch_security_episodes';

export interface SecurityEpisodeAction {
  id: string;
  order: number;
  displayName: string;
  iconType: string;
  /** When set, the menu item navigates to this sub-panel instead of executing directly */
  panel?: string;
  isCompatible: (ctx: { episodes: SecurityAlertEpisode[] }) => boolean;
  execute: (ctx: {
    episodes: SecurityAlertEpisode[];
    onSuccess?: () => void;
    reason?: string;
  }) => Promise<void>;
}

interface WorkflowActionDeps {
  http: HttpStart;
  notifications: NotificationsStart;
}

/**
 * Workflow state machine (aligned with platform primitives):
 *   open  ──► ack (Acknowledge)  or  deactivate (Close)
 *   ack   ──► unack (Unacknowledge)  or  deactivate (Close)
 *   closed ──► activate (Re-open)
 *
 * "Close" maps to platform DEACTIVATE (suppresses notifications, shows as inactive).
 * "Re-open" maps to platform ACTIVATE (reverses deactivation).
 */
export const createWorkflowActions = (deps: WorkflowActionDeps): SecurityEpisodeAction[] => [
  {
    id: 'SECURITY_WORKFLOW_ACK',
    order: 1,
    displayName: i18n.translate('xpack.securitySolution.alertsV2.action.acknowledge', {
      defaultMessage: 'Acknowledge',
    }),
    iconType: 'check',
    isCompatible: ({ episodes }) =>
      episodes.length > 0 && episodes.some((ep) => ep.workflow_status === 'open'),
    execute: async ({ episodes, onSuccess }) => {
      const items = episodes
        .filter((ep) => ep.workflow_status === 'open')
        .map((ep) => ({
          group_hash: ep.group_hash,
          action_type: ALERT_EPISODE_ACTION_TYPE.ACK as const,
          episode_id: ep['episode.id'],
        }));
      if (!items.length) return;
      try {
        await bulkCreateAlertActions(deps.http, items);
        deps.notifications.toasts.addSuccess(
          i18n.translate('xpack.securitySolution.alertsV2.action.ackSuccess', {
            defaultMessage:
              '{count, plural, one {Alert acknowledged} other {# alerts acknowledged}}',
            values: { count: items.length },
          })
        );
        onSuccess?.();
      } catch {
        deps.notifications.toasts.addDanger(
          i18n.translate('xpack.securitySolution.alertsV2.action.ackError', {
            defaultMessage: 'Failed to acknowledge alerts',
          })
        );
      }
    },
  },
  {
    id: 'SECURITY_WORKFLOW_UNACK',
    order: 2,
    displayName: i18n.translate('xpack.securitySolution.alertsV2.action.unacknowledge', {
      defaultMessage: 'Unacknowledge',
    }),
    iconType: 'crossInCircle',
    isCompatible: ({ episodes }) =>
      episodes.length > 0 && episodes.some((ep) => ep.workflow_status === 'acknowledged'),
    execute: async ({ episodes, onSuccess }) => {
      const items = episodes
        .filter((ep) => ep.workflow_status === 'acknowledged')
        .map((ep) => ({
          group_hash: ep.group_hash,
          action_type: ALERT_EPISODE_ACTION_TYPE.UNACK as const,
          episode_id: ep['episode.id'],
        }));
      if (!items.length) return;
      try {
        await bulkCreateAlertActions(deps.http, items);
        deps.notifications.toasts.addSuccess(
          i18n.translate('xpack.securitySolution.alertsV2.action.unackSuccess', {
            defaultMessage:
              '{count, plural, one {Alert unacknowledged} other {# alerts unacknowledged}}',
            values: { count: items.length },
          })
        );
        onSuccess?.();
      } catch {
        deps.notifications.toasts.addDanger(
          i18n.translate('xpack.securitySolution.alertsV2.action.unackError', {
            defaultMessage: 'Failed to unacknowledge alerts',
          })
        );
      }
    },
  },
  {
    id: 'SECURITY_WORKFLOW_CLOSE',
    order: 3,
    displayName: i18n.translate('xpack.securitySolution.alertsV2.action.close', {
      defaultMessage: 'Close',
    }),
    iconType: 'securitySignalResolved',
    panel: 'CLOSE_REASON_PANEL',
    isCompatible: ({ episodes }) =>
      episodes.length > 0 &&
      episodes.some((ep) => ep.workflow_status === 'open' || ep.workflow_status === 'acknowledged'),
    execute: async ({ episodes, onSuccess, reason }) => {
      const items = episodes
        .filter((ep) => ep.workflow_status === 'open' || ep.workflow_status === 'acknowledged')
        .map((ep) => ({
          group_hash: ep.group_hash,
          action_type: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE as const,
          reason: reason ?? 'Closed by user',
        }));
      if (!items.length) return;
      try {
        await bulkCreateAlertActions(deps.http, items);
        deps.notifications.toasts.addSuccess(
          i18n.translate('xpack.securitySolution.alertsV2.action.closeSuccess', {
            defaultMessage:
              '{count, plural, one {Alert closed} other {# alerts closed}} successfully',
            values: { count: items.length },
          })
        );
        onSuccess?.();
      } catch {
        deps.notifications.toasts.addDanger(
          i18n.translate('xpack.securitySolution.alertsV2.action.closeError', {
            defaultMessage: 'Failed to close alerts',
          })
        );
      }
    },
  },
  {
    id: 'SECURITY_WORKFLOW_REOPEN',
    order: 4,
    displayName: i18n.translate('xpack.securitySolution.alertsV2.action.reopen', {
      defaultMessage: 'Re-open',
    }),
    iconType: 'securitySignal',
    isCompatible: ({ episodes }) =>
      episodes.length > 0 && episodes.some((ep) => ep.workflow_status === 'closed'),
    execute: async ({ episodes, onSuccess }) => {
      const items = episodes
        .filter((ep) => ep.workflow_status === 'closed')
        .map((ep) => ({
          group_hash: ep.group_hash,
          action_type: ALERT_EPISODE_ACTION_TYPE.ACTIVATE as const,
          reason: 'Re-opened by user',
        }));
      if (!items.length) return;
      try {
        await bulkCreateAlertActions(deps.http, items);
        deps.notifications.toasts.addSuccess(
          i18n.translate('xpack.securitySolution.alertsV2.action.reopenSuccess', {
            defaultMessage:
              '{count, plural, one {Alert re-opened} other {# alerts re-opened}} successfully',
            values: { count: items.length },
          })
        );
        onSuccess?.();
      } catch {
        deps.notifications.toasts.addDanger(
          i18n.translate('xpack.securitySolution.alertsV2.action.reopenError', {
            defaultMessage: 'Failed to re-open alerts',
          })
        );
      }
    },
  },
];
