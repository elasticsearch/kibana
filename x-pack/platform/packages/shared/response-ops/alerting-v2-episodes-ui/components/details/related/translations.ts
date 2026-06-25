/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const RELATED_EPISODES_TITLE = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.title',
  {
    defaultMessage: 'Related alert episodes',
  }
);

export const RELATED_EPISODES_EMPTY = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.empty',
  {
    defaultMessage: 'No related episodes found.',
  }
);

export const RELATED_SAME_GROUP_TITLE = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.sameGroupTitle',
  {
    defaultMessage: 'Same alert group',
  }
);

export const RELATED_SAME_GROUP_DESCRIPTION = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.sameGroupDescription',
  {
    defaultMessage: 'Other episodes for this rule that share the same group as this alert.',
  }
);

export const RELATED_SAME_GROUP_EMPTY = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.sameGroupEmpty',
  {
    defaultMessage: 'No other episodes in this group.',
  }
);

export const RELATED_OTHER_GROUPS_TITLE = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.otherGroupsTitle',
  {
    defaultMessage: 'Other groups for this rule',
  }
);

export const RELATED_OTHER_GROUPS_DESCRIPTION = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.otherGroupsDescription',
  {
    defaultMessage:
      'Other episodes for this rule that belong to a different group than the current alert.',
  }
);

export const RELATED_RULE_ONLY_LIST_TITLE = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.ruleOnlyListTitle',
  {
    defaultMessage: 'Other episodes for this rule',
  }
);

export const RELATED_RULE_ONLY_LIST_DESCRIPTION = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.ruleOnlyListDescription',
  {
    defaultMessage: 'Other episodes for this rule, excluding the current one.',
  }
);

export const RELATED_OTHER_GROUPS_EMPTY = i18n.translate(
  'xpack.alertingV2EpisodesUi.details.related.otherGroupsEmpty',
  {
    defaultMessage: 'No other related episodes for this rule.',
  }
);

export const getRelatedEpisodeMissingRuleTitle = (episodeId: string) =>
  i18n.translate('xpack.alertingV2EpisodesUi.details.related.missingRuleEpisodeTitle', {
    defaultMessage: 'Episode ID: {episodeId}',
    values: { episodeId },
  });
