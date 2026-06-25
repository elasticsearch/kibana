/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** --- Episode actions bar --- */
export const EPISODE_ACTIONS_BAR_MORE_ACTIONS = i18n.translate(
  'xpack.alertingV2EpisodesUi.episodeActionsBar.moreActionsButtonAriaLabel',
  { defaultMessage: 'More actions' }
);

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
