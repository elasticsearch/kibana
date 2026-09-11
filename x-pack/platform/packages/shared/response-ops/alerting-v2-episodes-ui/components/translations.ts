/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** --- Assignee cell --- */
export const ASSIGNEE_CELL_EMPTY = i18n.translate('xpack.alertingV2EpisodesUi.assigneeCell.empty', {
  defaultMessage: '—',
});

export const ASSIGNEE_CELL_PROFILE_LOAD_ERROR = i18n.translate(
  'xpack.alertingV2EpisodesUi.assigneeCell.profileLoadError',
  {
    defaultMessage: 'Could not load profile',
  }
);

export const ASSIGNEE_CELL_UNKNOWN_USER = i18n.translate(
  'xpack.alertingV2EpisodesUi.assigneeCell.unknownUser',
  {
    defaultMessage: 'Unknown user',
  }
);

/** --- Rule fetch hook --- */
export const FETCH_RULE_ERROR = i18n.translate(
  'xpack.alertingV2EpisodesUi.hooks.useFetchRule.errorMessage',
  {
    defaultMessage: 'Failed to load rule',
  }
);

/** --- Rule cell --- */
export const RULE_CELL_EMPTY_RULE = i18n.translate(
  'xpack.alertingV2EpisodesUi.ruleCell.emptyRule',
  {
    defaultMessage: '—',
  }
);

export const RULE_CELL_MISSING_RULE_LABEL = i18n.translate(
  'xpack.alertingV2EpisodesUi.ruleCell.missingRuleLabel',
  {
    defaultMessage: 'Unavailable rule',
  }
);

export const RULE_CELL_MISSING_RULE_TOOLTIP = i18n.translate(
  'xpack.alertingV2EpisodesUi.ruleCell.missingRuleTooltip',
  {
    defaultMessage:
      'This rule is not available. It may have been deleted, or you may not have access to it.',
  }
);

export const getRuleCellCopyRuleIdTooltip = (ruleId: string) =>
  i18n.translate('xpack.alertingV2EpisodesUi.ruleCell.copyRuleIdTooltip', {
    defaultMessage: 'Click to copy the full rule ID: {ruleId}',
    values: { ruleId },
  });

export const getDurationLowerBoundLabel = (duration: string) =>
  i18n.translate('xpack.alertingV2EpisodesUi.durationCell.lowerBoundLabel', {
    defaultMessage: '≥ {duration}',
    values: { duration },
  });

export const DURATION_LOWER_BOUND_TOOLTIP = i18n.translate(
  'xpack.alertingV2EpisodesUi.durationCell.lowerBoundTooltip',
  {
    defaultMessage:
      'The episode started before the selected time range, so its actual duration is longer. Widen the time range or open the episode to see it.',
  }
);

export const RULE_CELL_RULE_ID_COPIED = i18n.translate(
  'xpack.alertingV2EpisodesUi.ruleCell.ruleIdCopied',
  {
    defaultMessage: 'Rule ID copied',
  }
);
