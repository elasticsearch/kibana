/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const STEP_ATTACH_TITLE = i18n.translate('xpack.cases.caseView.tour.attach.title', {
  defaultMessage: 'Attach to your case',
});

export const STEP_ATTACH_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.tour.attach.description',
  {
    defaultMessage: 'Add files, alerts, visualizations, and more from the new attach button.',
  }
);

export const STEP_CHAT_TITLE = i18n.translate('xpack.cases.caseView.tour.chat.title', {
  defaultMessage: 'Add to chat',
});

export const STEP_CHAT_DESCRIPTION = i18n.translate('xpack.cases.caseView.tour.chat.description', {
  defaultMessage: 'Add this case to a chat or ask the AI Assistant to summarize it.',
});

export const STEP_PILLS_TITLE = i18n.translate('xpack.cases.caseView.tour.pills.title', {
  defaultMessage: 'Status and severity',
});

export const STEP_PILLS_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.tour.pills.description',
  {
    defaultMessage: 'Update the case status and severity right from these pills.',
  }
);

export const STEP_SETTINGS_TITLE = i18n.translate('xpack.cases.caseView.tour.settings.title', {
  defaultMessage: 'Case settings',
});

export const STEP_SETTINGS_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.tour.settings.description',
  {
    defaultMessage:
      'Turn case features like detection syncing and observable extraction on or off here.',
  }
);

export const STEP_ATTRIBUTES_TITLE = i18n.translate('xpack.cases.caseView.tour.attributes.title', {
  defaultMessage: 'Attributes',
});

export const STEP_ATTRIBUTES_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.tour.attributes.description',
  {
    defaultMessage:
      'Manage assignees, status, severity, tags, and category in the Attributes panel.',
  }
);

export const STEP_TEMPLATE_FIELDS_TITLE = i18n.translate(
  'xpack.cases.caseView.tour.templateFields.title',
  {
    defaultMessage: 'Custom fields',
  }
);

export const STEP_TEMPLATE_FIELDS_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.tour.templateFields.description',
  {
    defaultMessage: "Fields from the case's template, plus global fields, appear here.",
  }
);

export const STEP_CONNECTOR_TITLE = i18n.translate('xpack.cases.caseView.tour.connector.title', {
  defaultMessage: 'Connector',
});

export const STEP_CONNECTOR_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.tour.connector.description',
  {
    defaultMessage: 'Push case updates to an external system from the Connector section.',
  }
);
