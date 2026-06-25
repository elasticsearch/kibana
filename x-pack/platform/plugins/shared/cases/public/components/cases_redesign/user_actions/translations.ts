/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const MORE_ACTIVITIES = (count: number) =>
  i18n.translate('xpack.cases.caseView.redesign.userActions.moreActivities', {
    values: { count },
    defaultMessage: '{count} more {count, plural, =1 {activity} other {activities}}',
  });

export const SHOW_MORE_ACTIVITIES_ARIA = i18n.translate(
  'xpack.cases.caseView.redesign.userActions.showMoreActivitiesAria',
  { defaultMessage: 'Show more activities' }
);
