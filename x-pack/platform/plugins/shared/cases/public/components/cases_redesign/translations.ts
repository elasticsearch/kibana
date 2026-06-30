/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const CASES_LIST_TITLE = i18n.translate('xpack.cases.casesRedesign.list.title', {
  defaultMessage: 'Cases List (Redesign)',
});

export const CASE_DETAILS_TITLE = i18n.translate('xpack.cases.casesRedesign.details.title', {
  defaultMessage: 'Case Details (Redesign)',
});

export const CASE_SETTINGS_TITLE = i18n.translate('xpack.cases.casesRedesign.settings.title', {
  defaultMessage: 'Case Settings (Redesign)',
});

export const UNDER_CONSTRUCTION = i18n.translate('xpack.cases.casesRedesign.underConstruction', {
  defaultMessage: 'This page is under construction.',
});

export const VIEWING_CASE = (caseId: string) =>
  i18n.translate('xpack.cases.casesRedesign.details.viewingCase', {
    defaultMessage: 'Viewing case: {caseId}. This page is under construction.',
    values: { caseId },
  });

export const SHOW_METRICS = i18n.translate('xpack.cases.casesRedesign.details.showMetrics', {
  defaultMessage: 'Show metrics',
});

export const REPORTED_BY = (name: string) =>
  i18n.translate('xpack.cases.casesRedesign.details.reportedBy', {
    defaultMessage: 'Reported by: {name}',
    values: { name },
  });

export const CREATED_ON = (date: string) =>
  i18n.translate('xpack.cases.casesRedesign.details.createdOn', {
    defaultMessage: 'on: {date}',
    values: { date },
  });

export const UNKNOWN_REPORTER = i18n.translate(
  'xpack.cases.casesRedesign.details.unknownReporter',
  {
    defaultMessage: 'Unknown',
  }
);

export const EDIT_CASE_NAME_ARIA = i18n.translate(
  'xpack.cases.casesRedesign.details.editCaseNameAria',
  {
    defaultMessage: 'Edit case name',
  }
);

export const SHOW_FIELDS = i18n.translate('xpack.cases.casesRedesign.details.showFields', {
  defaultMessage: 'Show fields',
});

export const HIDE_FIELDS = i18n.translate('xpack.cases.casesRedesign.details.hideFields', {
  defaultMessage: 'Hide fields',
});
