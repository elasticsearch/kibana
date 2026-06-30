/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** --- Timeline section (empty / error states) --- */
export const EMPTY_TITLE = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.emptyTitle',
  {
    defaultMessage: 'No timeline events yet',
  }
);

export const EMPTY_BODY = i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.emptyBody', {
  defaultMessage: 'Status changes and actions will appear here.',
});

export const BULK_GET_PROFILES_ERROR = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.bulkGetProfilesError',
  {
    defaultMessage: 'Could not load actor profiles',
  }
);

/** --- Timeline (shared labels) --- */
export const SYSTEM_LABEL = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.systemLabel',
  {
    defaultMessage: 'system',
  }
);

/** --- Timeline (state-change comments) --- */
export const EPISODE_STARTED = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.episodeStarted',
  {
    defaultMessage: 'Episode started',
  }
);

export const STATUS_CHANGED = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.statusChanged',
  {
    defaultMessage: 'Episode status changed',
  }
);

export const getAfterNEventsLabel = (count: number, prevStatus: string): string =>
  i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.afterNEvents', {
    defaultMessage: 'After {count} {prevStatus} {count, plural, one {event} other {events}}',
    values: { count, prevStatus },
  });

/** --- Timeline (action comments) --- */
export const ACTION_LABELS: Record<string, string> = {
  ack: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.ack', {
    defaultMessage: 'acknowledged',
  }),
  unack: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.unack', {
    defaultMessage: 'unacknowledged',
  }),
  snooze: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.snooze', {
    defaultMessage: 'snoozed',
  }),
  unsnooze: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.unsnooze', {
    defaultMessage: 'unsnoozed',
  }),
  deactivate: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.deactivate', {
    defaultMessage: 'resolved',
  }),
  activate: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.activate', {
    defaultMessage: 're-opened',
  }),
  tag: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.tag', {
    defaultMessage: 'updated tags',
  }),
  assign: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.actionLabel.assign', {
    defaultMessage: 'updated assignee',
  }),
};

// Preposition joining the action verb to the timestamp shown by EuiComment,
// kept separate so translators can reorder it relative to the verb.
export const ACTION_ON_LABEL = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.actionOnLabel',
  {
    defaultMessage: 'on',
  }
);

export const STATUS_LABELS: Record<string, string> = {
  pending: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.statusLabel.pending', {
    defaultMessage: 'pending',
  }),
  active: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.statusLabel.active', {
    defaultMessage: 'active',
  }),
  recovering: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.statusLabel.recovering', {
    defaultMessage: 'recovering',
  }),
  inactive: i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.statusLabel.inactive', {
    defaultMessage: 'inactive',
  }),
};

/** --- Timeline (action body) --- */
export const SHOW_FULL_EVENT = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.showFullEvent',
  {
    defaultMessage: 'Show full event',
  }
);

export const SNOOZED_INDEFINITELY = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.timeline.snoozedIndefinitely',
  {
    defaultMessage: 'Indefinitely',
  }
);

export const getSnoozedUntilLabel = (date: string): string =>
  i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.snoozedUntil', {
    defaultMessage: 'Until {date}',
    values: { date },
  });

export const formatSnoozeDuration = (startIso: string, endIso: string): string | null => {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return null;
  if (ms < 60 * 60 * 1000) {
    const n = Math.round(ms / (60 * 1000));
    return i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.snoozeDurationMinutes', {
      defaultMessage: '{n, plural, one {# minute} other {# minutes}}',
      values: { n },
    });
  }
  if (ms < 24 * 60 * 60 * 1000) {
    const n = Math.round(ms / (60 * 60 * 1000));
    return i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.snoozeDurationHours', {
      defaultMessage: '{n, plural, one {# hour} other {# hours}}',
      values: { n },
    });
  }
  const n = Math.round(ms / (24 * 60 * 60 * 1000));
  return i18n.translate('xpack.alertingV2EpisodesUi.details.timeline.snoozeDurationDays', {
    defaultMessage: '{n, plural, one {# day} other {# days}}',
    values: { n },
  });
};
