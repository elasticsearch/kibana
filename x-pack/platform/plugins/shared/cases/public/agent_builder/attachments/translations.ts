/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

// ── Single-case attachment ────────────────────────────────────────────────────

export const CASE_HEADER = i18n.translate('xpack.cases.agentBuilder.case.header', {
  defaultMessage: 'Case',
});

export const GO_TO_CASE = i18n.translate('xpack.cases.agentBuilder.case.goToCase', {
  defaultMessage: 'Go to case',
});

export const SHOW_MORE = i18n.translate('xpack.cases.agentBuilder.case.showMore', {
  defaultMessage: 'Show more',
});

export const SHOW_LESS = i18n.translate('xpack.cases.agentBuilder.case.showLess', {
  defaultMessage: 'Show less',
});

export const DESCRIPTION = i18n.translate('xpack.cases.agentBuilder.case.description', {
  defaultMessage: 'Description',
});

export const CATEGORY = i18n.translate('xpack.cases.agentBuilder.case.category', {
  defaultMessage: 'Category',
});

export const TAGS = i18n.translate('xpack.cases.agentBuilder.case.tags', {
  defaultMessage: 'Tags',
});

export const CREATED = i18n.translate('xpack.cases.agentBuilder.case.created', {
  defaultMessage: 'Created',
});

export const UPDATED = i18n.translate('xpack.cases.agentBuilder.case.updated', {
  defaultMessage: 'Last updated',
});

export const OBSERVABLES = i18n.translate('xpack.cases.agentBuilder.case.observables', {
  defaultMessage: 'Observables',
});

export const CONNECTOR = i18n.translate('xpack.cases.agentBuilder.case.connector', {
  defaultMessage: 'Connector',
});

// ── Case meta row (badges) ────────────────────────────────────────────────────

export const VIEW_ALERTS = i18n.translate('xpack.cases.agentBuilder.caseMetaRow.viewAlerts', {
  defaultMessage: 'View alerts',
});

export const VIEW_COMMENTS = i18n.translate('xpack.cases.agentBuilder.caseMetaRow.viewComments', {
  defaultMessage: 'View comments',
});

// ── Cases list attachment ─────────────────────────────────────────────────────

export const GO_TO_CASES = i18n.translate('xpack.cases.agentBuilder.cases.goToCases', {
  defaultMessage: 'Go to cases',
});

export const CASES_HEADER = (count: number) =>
  i18n.translate('xpack.cases.agentBuilder.cases.header', {
    defaultMessage: '{count, plural, one {# Case} other {# Cases}}',
    values: { count },
  });

export const CASES_LABEL = (count: number) =>
  i18n.translate('xpack.cases.agentBuilder.cases.label', {
    defaultMessage: '{count, plural, one {# case} other {# cases}}',
    values: { count },
  });

export const SHOWING_FOOTER = (visible: number, total: number) =>
  i18n.translate('xpack.cases.agentBuilder.cases.showingFooter', {
    defaultMessage: 'Showing {visible} of {total}',
    values: { visible, total },
  });

export const NO_CASES = i18n.translate('xpack.cases.agentBuilder.cases.noCases', {
  defaultMessage: 'No cases to display',
});
