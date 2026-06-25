/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** --- Breadcrumb --- */
export const EPISODE_DETAILS_BREADCRUMB_FALLBACK = i18n.translate(
  'xpack.alertingV2.breadcrumbs.episodeDetailsFallback',
  {
    defaultMessage: 'Alert episode',
  }
);

export const OVERVIEW_TAB_TITLE = i18n.translate(
  'xpack.alertingV2.episodeDetails.mainTabOverview',
  {
    defaultMessage: 'Overview',
  }
);

export const METADATA_TAB_TITLE = i18n.translate(
  'xpack.alertingV2.episodeDetails.mainTabMetadata',
  {
    defaultMessage: 'Metadata',
  }
);

/** --- Duration (sidebar) --- */
export const FORMAT_EPISODE_DURATION_MS = (ms: number): string => {
  if (ms < 1000) {
    return i18n.translate('xpack.alertingV2.episodeDetails.durationMs', {
      defaultMessage: '{ms} ms',
      values: { ms: Math.round(ms) },
    });
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return i18n.translate('xpack.alertingV2.episodeDetails.durationDays', {
      defaultMessage: '{days} d',
      values: { days },
    });
  }
  if (hours > 0) {
    return i18n.translate('xpack.alertingV2.episodeDetails.durationHours', {
      defaultMessage: '{hours} h',
      values: { hours },
    });
  }
  if (minutes > 0) {
    return i18n.translate('xpack.alertingV2.episodeDetails.durationMinutes', {
      defaultMessage: '{minutes} min',
      values: { minutes },
    });
  }
  return i18n.translate('xpack.alertingV2.episodeDetails.durationSeconds', {
    defaultMessage: '{seconds} s',
    values: { seconds },
  });
};

/** --- Rule kind --- */
export const RULE_KIND_SIGNAL = i18n.translate('xpack.alertingV2.episodeDetails.ruleKindSignal', {
  defaultMessage: 'Signal',
});

export const RULE_KIND_ALERTING = i18n.translate(
  'xpack.alertingV2.episodeDetails.ruleKindAlerting',
  {
    defaultMessage: 'Alert',
  }
);

/** --- Error state --- */
export const EPISODE_NOT_FOUND_TITLE = i18n.translate(
  'xpack.alertingV2.episodes.episodeNotFoundTitle',
  {
    defaultMessage: 'Unable to load episode',
  }
);

export const EPISODE_NOT_FOUND_BODY = i18n.translate(
  'xpack.alertingV2.episodes.episodeNotFoundBody',
  {
    defaultMessage: 'The alert episode could not be found or an error occurred while loading it.',
  }
);

export const BACK_TO_ALERT_EPISODES = i18n.translate('xpack.alertingV2.episodes.backToEpisodes', {
  defaultMessage: 'Back to alert episodes',
});

/** --- Page header --- */
export const LOADING_RULE_TITLE = i18n.translate(
  'xpack.alertingV2.episodeDetails.loadingRuleTitle',
  {
    defaultMessage: 'Episode details',
  }
);

/** --- Sidebar --- */
export const SIDEBAR_TITLE_EPISODE_DETAILS = i18n.translate(
  'xpack.alertingV2.episodeDetails.sidebarTitle',
  {
    defaultMessage: 'Episode details',
  }
);

export const SIDEBAR_TITLE_RUNBOOK = i18n.translate(
  'xpack.alertingV2.episodeDetails.runbookTitle',
  {
    defaultMessage: 'Runbook',
  }
);

export const SIDEBAR_VIEW_LEGEND = i18n.translate(
  'xpack.alertingV2.episodeDetails.sidebarViewLegend',
  {
    defaultMessage: 'Sidebar section',
  }
);

export const SIDEBAR_TAB_TITLE_DETAILS = i18n.translate(
  'xpack.alertingV2.episodeDetails.sidebarTabTitle',
  {
    defaultMessage: 'Details',
  }
);

/** --- Episode details list --- */
export const GROUPING_LABEL = i18n.translate('xpack.alertingV2.episodeDetails.groupingLabel', {
  defaultMessage: 'Grouping fields',
});

export const TAGS_LABEL = i18n.translate('xpack.alertingV2.episodeDetails.tagsLabel', {
  defaultMessage: 'Tags',
});

export const TRIGGERED_LABEL = i18n.translate('xpack.alertingV2.episodeDetails.triggeredLabel', {
  defaultMessage: 'Triggered',
});

export const DURATION_LABEL = i18n.translate('xpack.alertingV2.episodeDetails.durationLabel', {
  defaultMessage: 'Duration',
});

export const ASSIGNEE_LABEL = i18n.translate('xpack.alertingV2.episodeDetails.assigneeLabel', {
  defaultMessage: 'Assignee',
});

export const ACTIONS_OVERVIEW_TITLE = i18n.translate(
  'xpack.alertingV2.episodeDetails.actionsOverviewTitle',
  {
    defaultMessage: 'Actions overview',
  }
);

export const ACTIONS_OVERVIEW_EMPTY = i18n.translate(
  'xpack.alertingV2.episodeDetails.actionsOverviewEmpty',
  {
    defaultMessage: 'No actions have been taken on this episode.',
  }
);

export const LABEL_ACKNOWLEDGED_BY = i18n.translate(
  'xpack.alertingV2.episodeDetails.acknowledgedByLabel',
  {
    defaultMessage: 'Acknowledged by',
  }
);

export const LABEL_SNOOZED_BY = i18n.translate('xpack.alertingV2.episodeDetails.snoozedByLabel', {
  defaultMessage: 'Snoozed by',
});

export const LABEL_SNOOZED_UNTIL = i18n.translate(
  'xpack.alertingV2.episodeDetails.snoozedUntilLabel',
  {
    defaultMessage: 'Snoozed until',
  }
);

export const LABEL_RESOLVED_BY = i18n.translate('xpack.alertingV2.episodeDetails.resolvedByLabel', {
  defaultMessage: 'Resolved by',
});

/** --- Rule overview panel --- */

export const RULE_OVERVIEW_TITLE = i18n.translate(
  'xpack.alertingV2.episodeDetails.ruleOverviewTitle',
  {
    defaultMessage: 'Rule overview',
  }
);

export const VIEW_RULE_DETAILS = i18n.translate('xpack.alertingV2.episodeDetails.viewRuleDetails', {
  defaultMessage: 'View rule details',
});

export const RULE_STATUS_ENABLED = i18n.translate(
  'xpack.alertingV2.episodeDetails.ruleStatusEnabled',
  {
    defaultMessage: 'Enabled',
  }
);

export const RULE_STATUS_DISABLED = i18n.translate(
  'xpack.alertingV2.episodeDetails.ruleStatusDisabled',
  {
    defaultMessage: 'Disabled',
  }
);

/** --- Runbook --- */
export const RUNBOOK_EMPTY = i18n.translate('xpack.alertingV2.episodeDetails.runbookEmpty', {
  defaultMessage: 'No runbook has been added to this rule.',
});
