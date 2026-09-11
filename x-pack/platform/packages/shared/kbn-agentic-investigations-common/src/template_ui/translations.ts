/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const TEMPLATE_UI_LABELS = Object.freeze({
  loading: i18n.translate('xpack.alertzero.templateUi.loading', {
    defaultMessage: 'Loading investigation',
  }),
  loadErrorTitle: i18n.translate('xpack.alertzero.templateUi.loadErrorTitle', {
    defaultMessage: 'Unable to load this investigation',
  }),
  notFoundTitle: i18n.translate('xpack.alertzero.templateUi.notFoundTitle', {
    defaultMessage: 'No investigation for this conversation',
  }),
  status: i18n.translate('xpack.alertzero.templateUi.status', {
    defaultMessage: 'Status',
  }),
  assignees: i18n.translate('xpack.alertzero.templateUi.assignees', {
    defaultMessage: 'Assignees',
  }),
  unassigned: i18n.translate('xpack.alertzero.templateUi.unassigned', {
    defaultMessage: 'Unassigned',
  }),
});
