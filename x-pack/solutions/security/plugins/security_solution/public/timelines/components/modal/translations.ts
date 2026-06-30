/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const SUPER_TIMELINE_READONLY_BADGE = i18n.translate(
  'xpack.securitySolution.timeline.flyout.header.superTimelineReadonlyBadge',
  { defaultMessage: 'Super Timeline — read-only' }
);

export const CLOSE_TIMELINE_OR_TEMPLATE = (isTimeline: boolean) =>
  i18n.translate('xpack.securitySolution.timeline.flyout.header.closeTimelineButtonLabel', {
    defaultMessage: 'Close {isTimeline, select, true {Timeline} other {template}}',
    values: {
      isTimeline,
    },
  });
