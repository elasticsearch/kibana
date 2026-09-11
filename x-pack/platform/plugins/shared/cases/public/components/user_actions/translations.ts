/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export * from '../case_view/translations';

export const ALREADY_PUSHED_TO_SERVICE = (externalService: string) =>
  i18n.translate('xpack.cases.caseView.alreadyPushedToExternalService', {
    values: { externalService },
    defaultMessage: 'Already pushed to { externalService } incident',
  });

export const REQUIRED_UPDATE_TO_SERVICE = (externalService: string) =>
  i18n.translate('xpack.cases.caseView.requiredUpdateToExternalService', {
    values: { externalService },
    defaultMessage: 'Requires update to { externalService } incident',
  });

export const COPY_REFERENCE_LINK = i18n.translate('xpack.cases.caseView.copyCommentLinkAria', {
  defaultMessage: 'Copy reference link',
});

export const MOVE_TO_ORIGINAL_COMMENT = i18n.translate('xpack.cases.caseView.moveToCommentAria', {
  defaultMessage: 'Highlight the referenced comment',
});

export const CANCEL_BUTTON = i18n.translate('xpack.cases.caseView.delete.cancel', {
  defaultMessage: 'Cancel',
});

export const DELETE = i18n.translate('xpack.cases.caseView.delete.confirm', {
  defaultMessage: 'Delete',
});

export const ASSIGNED = i18n.translate('xpack.cases.caseView.assigned', {
  defaultMessage: 'assigned',
});

export const UNASSIGNED = i18n.translate('xpack.cases.caseView.unAssigned', {
  defaultMessage: 'unassigned',
});

export const THEMSELVES = i18n.translate('xpack.cases.caseView.assignee.themselves', {
  defaultMessage: 'themselves',
});

export const AND = i18n.translate('xpack.cases.caseView.assignee.and', {
  defaultMessage: 'and',
});

export const UNSAVED_DRAFT_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.description.unsavedDraftDescription',
  {
    defaultMessage: 'You have unsaved edits for the description',
  }
);

export const RESUME_EDITING_DESCRIPTION = i18n.translate(
  'xpack.cases.caseView.description.resumeEditing',
  {
    defaultMessage: 'Resume editing',
  }
);

export const SHOW_MORE = i18n.translate('xpack.cases.caseView.userActions.showMore', {
  defaultMessage: 'Show more',
});

export const CREATE_CASE = i18n.translate('xpack.cases.caseView.userActions.createCase', {
  defaultMessage: 'Created case',
});

export const CASE_INITIATED = i18n.translate('xpack.cases.caseView.userActions.caseInitiated', {
  defaultMessage: 'Case initiated',
});

export const CASE_DELETED = i18n.translate('xpack.cases.caseView.userActions.caseDeleted', {
  defaultMessage: `Case deleted`,
});

export const SEVERITY = i18n.translate('xpack.cases.caseView.userActions.severity', {
  defaultMessage: 'Severity',
});

export const TITLE = i18n.translate('xpack.cases.caseView.userActions..title', {
  defaultMessage: 'Title',
});

export const SETTING = i18n.translate('xpack.cases.caseView.userActions..settings', {
  defaultMessage: 'Settings',
});

export const CUSTOM_FIELDS = i18n.translate('xpack.cases.caseView.userActions.customFields', {
  defaultMessage: 'Custom Fields',
});

export const OBSERVABLES = i18n.translate('xpack.cases.caseView.userActions.observables', {
  defaultMessage: 'Observables',
});

export const USER_ACTION_EDITED = (type: string) =>
  i18n.translate('xpack.cases.caseView.userActions.edited', {
    values: { type },
    defaultMessage: `Edited "{type}"`,
  });

export const UPDATED_TEMPLATE_FIELDS = i18n.translate(
  'xpack.cases.caseView.userActions.updatedTemplateFields',
  {
    defaultMessage: 'updated template fields',
  }
);

export const SET_TEMPLATE_FIELD_LABEL = (fieldName: string, value: string) =>
  i18n.translate('xpack.cases.caseView.userActions.setTemplateFieldLabel', {
    defaultMessage: 'set {fieldName} to {value}',
    values: { fieldName, value },
  });

export const SET_TEMPLATE_FIELD_LABEL_PREFIX = (fieldName: string) =>
  i18n.translate('xpack.cases.caseView.userActions.setTemplateFieldLabelPrefix', {
    defaultMessage: 'set {fieldName} to',
    values: { fieldName },
  });

export const EXTENDED_FIELDS = i18n.translate('xpack.cases.caseView.userActions.extendedFields', {
  defaultMessage: 'Template Fields',
});

export const APPLIED_TEMPLATE = i18n.translate('xpack.cases.caseView.userActions.appliedTemplate', {
  defaultMessage: 'Applied Template',
});

export const APPLIED_TEMPLATE_LABEL = i18n.translate(
  'xpack.cases.caseView.userActions.appliedTemplateLabel',
  { defaultMessage: 'applied template' }
);

export const APPLIED_NAMED_TEMPLATE_LABEL = (name: string) =>
  i18n.translate('xpack.cases.caseView.userActions.appliedNamedTemplateLabel', {
    values: { name },
    defaultMessage: 'applied {name} template',
  });

export const REMOVED_TEMPLATE_LABEL = i18n.translate(
  'xpack.cases.caseView.userActions.removedTemplateLabel',
  { defaultMessage: 'removed applied template' }
);

export const SYNCED_ALERTS_WITH_CLOSE_REASON = (count: number) =>
  i18n.translate('xpack.cases.caseView.userActions.status.syncedAlertsWithCloseReason', {
    values: { count },
    defaultMessage:
      'and synced {count, plural, =1 {# detection} other {# detections}} with close reason',
  });
