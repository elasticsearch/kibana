/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const EVENT_DISPLAY_NAME = i18n.translate('xpack.securitySolution.cases.event.displayName', {
  defaultMessage: 'Events',
});

export const DATA_VIEW_ERROR = i18n.translate('xpack.securitySolution.caseEvents.dataViewError', {
  defaultMessage: 'Data View Error',
});

export const TABLE_UNIT = (totalEvents: number) =>
  i18n.translate('xpack.securitySolution.caseEvents.unit', {
    defaultMessage: '{totalEvents} {totalEvents, plural, =1 {event} other {events}}',
    values: { totalEvents },
  });

export const EVENTS_ERROR_TITLE = i18n.translate('xpack.securitySolution.caseEvents.errorTitle', {
  defaultMessage: 'Error Searching Events',
});

export const NO_EVENTS_TITLE = i18n.translate('xpack.securitySolution.caseEvents.noEvents', {
  defaultMessage: 'No Events Found',
});

export const ADD_TO_NEW_CASE = i18n.translate('xpack.securitySolution.caseEvents.addToNewCase', {
  defaultMessage: 'Add to new case',
});

export const ADD_TO_EXISTING_CASE = i18n.translate(
  'xpack.securitySolution.caseEvents.addToExistingCase',
  {
    defaultMessage: 'Add to existing case',
  }
);
export const EVENT_COMMENT_LABEL_TITLE = i18n.translate(
  'xpack.securitySolution.cases.eventAttachment.eventCommentLabelTitle',
  {
    defaultMessage: 'added an event',
  }
);

export const MULTIPLE_EVENTS_COMMENT_LABEL_TITLE = (totalEvents: number) =>
  i18n.translate('xpack.securitySolution.cases.eventAttachment.multipleEventsCommentLabelTitle', {
    defaultMessage: 'added {totalEvents, plural, =1 {event} other {{totalEvents} events}}',
    values: { totalEvents },
  });

export const SHOW_EVENT_TOOLTIP = i18n.translate(
  'xpack.securitySolution.cases.eventAttachment.showEventTooltip',
  {
    defaultMessage: 'Show event details',
  }
);

export const REMOVED_EVENT_LABEL_TITLE = i18n.translate(
  'xpack.securitySolution.cases.eventAttachment.removedEventLabelTitle',
  {
    defaultMessage: 'removed event',
  }
);

export const REMOVED_EVENTS_LABEL_TITLE = (eventCount: number) =>
  i18n.translate('xpack.securitySolution.cases.eventAttachment.removedEventsLabelTitle', {
    defaultMessage: 'removed {eventCount, plural, =1 {event} other {{eventCount} events}}',
    values: { eventCount },
  });

export const DELETE_EVENTS_SUCCESS_TITLE = (totalEvents: number) =>
  i18n.translate('xpack.securitySolution.cases.eventAttachment.deleteEventsSuccessTitle', {
    defaultMessage:
      'Deleted {totalEvents, plural, =1 {one} other {{totalEvents}}} {totalEvents, plural, =1 {event} other {events}}',
    values: { totalEvents },
  });
