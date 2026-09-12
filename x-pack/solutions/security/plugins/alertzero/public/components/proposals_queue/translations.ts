/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const LOADING = i18n.translate('xpack.alertzero.proposalsQueue.loading', {
  defaultMessage: 'Loading proposals',
});

export const LOAD_ERROR = i18n.translate('xpack.alertzero.proposalsQueue.loadError', {
  defaultMessage: 'Unable to load proposals',
});

export const EMPTY_SECTION = i18n.translate('xpack.alertzero.proposalsQueue.emptySection', {
  defaultMessage: 'Nothing awaiting a decision here',
});

export const CLOSED_SECTION_LABEL = i18n.translate(
  'xpack.alertzero.proposalsQueue.closedSectionLabel',
  { defaultMessage: 'Closed actions' }
);

export const CLOSED_SECTION_CAPTION = i18n.translate(
  'xpack.alertzero.proposalsQueue.closedSectionCaption',
  { defaultMessage: 'Closed actions; the investigation may still be open.' }
);

/**
 * Thread the limit in so the copy cannot drift from the server cap.
 * The whole phrase is inside `i18n.translate` so the i18n CI check can see it;
 * concatenating a raw number literal onto a translated fragment leaves half the
 * string outside the extractor.
 */
export const TRUNCATED = (limit: number) =>
  i18n.translate('xpack.alertzero.proposalsQueue.truncated', {
    defaultMessage:
      'Showing the first {limit} proposals. There may be more — the counts on this page are incomplete.',
    values: { limit },
  });

export const SHOW_MORE = (remaining: number) =>
  i18n.translate('xpack.alertzero.proposalsQueue.showMore', {
    defaultMessage: 'Show more ({remaining})',
    values: { remaining },
  });

export const SECTION_COUNT_ARIA_LABEL = (label: string, count: number) =>
  i18n.translate('xpack.alertzero.proposalsQueue.sectionCountAriaLabel', {
    defaultMessage: '{label}: {count, plural, one {# proposal} other {# proposals}}',
    values: { label, count },
  });
