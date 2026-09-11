/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const BACK_TO_ALL = i18n.translate('xpack.cases.caseView.backLabel', {
  defaultMessage: 'Back to cases',
});

export const CANCEL = i18n.translate('xpack.cases.caseView.cancel', {
  defaultMessage: 'Cancel',
});

export const DELETE_CASE = (quantity: number = 1) =>
  i18n.translate('xpack.cases.confirmDeleteCase.deleteCase', {
    values: { quantity },
    defaultMessage: `Delete {quantity, plural, =1 {case} other {{quantity} cases}}`,
  });

export const COPY_ID_ACTION_LABEL = i18n.translate('xpack.cases.caseView.copyID', {
  defaultMessage: 'Copy case ID',
});

export const COPY_ID_ACTION_SUCCESS = i18n.translate('xpack.cases.caseView.copyIDSuccess', {
  defaultMessage: 'Copied case ID to clipboard',
});

export const APPLY_TEMPLATE_ACTION_LABEL = i18n.translate(
  'xpack.cases.caseView.applyTemplateAction',
  {
    defaultMessage: 'Apply template',
  }
);

export const APPLY_TEMPLATE_MODAL_TITLE = i18n.translate(
  'xpack.cases.caseView.applyTemplateModal.title',
  {
    defaultMessage: 'Apply template',
  }
);

export const APPLY_TEMPLATE_MODAL_TEMPLATE_LABEL = i18n.translate(
  'xpack.cases.caseView.applyTemplateModal.templateLabel',
  {
    defaultMessage: 'Template',
  }
);

export const APPLY_TEMPLATE_MODAL_TEMPLATE_PLACEHOLDER = i18n.translate(
  'xpack.cases.caseView.applyTemplateModal.templatePlaceholder',
  {
    defaultMessage: 'Select a template',
  }
);

export const APPLY_TEMPLATE_MODAL_APPLY = i18n.translate(
  'xpack.cases.caseView.applyTemplateModal.apply',
  {
    defaultMessage: 'Apply',
  }
);

export const APPLY_TEMPLATE_MODAL_CONNECTOR_NOTICE = i18n.translate(
  'xpack.cases.caseView.applyTemplateModal.connectorNotice',
  {
    defaultMessage: "Applying a template does not change this case's connector.",
  }
);

export const NAME = i18n.translate('xpack.cases.caseView.name', {
  defaultMessage: 'Name',
});

export const CREATED_ON = i18n.translate('xpack.cases.caseView.createdOn', {
  defaultMessage: 'Created on',
});

export const UPDATED_ON = i18n.translate('xpack.cases.caseView.updatedOn', {
  defaultMessage: 'Updated on',
});

export const CLOSED_ON = i18n.translate('xpack.cases.caseView.closedOn', {
  defaultMessage: 'Closed on',
});

export const REPORTER = i18n.translate('xpack.cases.caseView.reporterLabel', {
  defaultMessage: 'Reporter',
});

export const PARTICIPANTS = i18n.translate('xpack.cases.caseView.particpantsLabel', {
  defaultMessage: 'Participants',
});

export const CREATE_CASE_TITLE = i18n.translate('xpack.cases.caseView.create', {
  defaultMessage: 'Create case',
});

export const DESCRIPTION = i18n.translate('xpack.cases.caseView.description', {
  defaultMessage: 'Description',
});

export const DESCRIPTION_REQUIRED = i18n.translate(
  'xpack.cases.createCase.descriptionFieldRequiredError',
  {
    defaultMessage: 'A description is required.',
  }
);

export const SOLUTION_REQUIRED = i18n.translate(
  'xpack.cases.createCase.solutionFieldRequiredError',
  {
    defaultMessage: 'A solution is required',
  }
);

export const ARIA_KEYPAD_LEGEND = i18n.translate(
  'xpack.cases.createCase.ariaKeypadSolutionSelection',
  {
    defaultMessage: 'Single solution select',
  }
);

export const EMPTY_COMMENTS_NOT_ALLOWED = i18n.translate(
  'xpack.cases.caseView.commentFieldRequiredError',
  {
    defaultMessage: 'Empty comments are not allowed.',
  }
);

export const REQUIRED_FIELD = i18n.translate('xpack.cases.caseView.fieldRequiredError', {
  defaultMessage: 'Required field',
});

export const EDIT = i18n.translate('xpack.cases.caseView.edit', {
  defaultMessage: 'Edit',
});

export const OPTIONAL = i18n.translate('xpack.cases.caseView.optional', {
  defaultMessage: 'Optional',
});

export const REQUIRED_ON_CLOSE = i18n.translate('xpack.cases.caseView.requiredOnClose', {
  defaultMessage: 'Required on close',
});

export const REQUIRED = i18n.translate('xpack.cases.caseView.required', {
  defaultMessage: 'Required',
});

export const PAGE_TITLE = i18n.translate('xpack.cases.pageTitle', {
  defaultMessage: 'Cases',
});

export const CREATE_CASE = i18n.translate('xpack.cases.caseView.createCase', {
  defaultMessage: 'Create case',
});

export const CLOSE_CASE = i18n.translate('xpack.cases.caseView.closeCase', {
  defaultMessage: 'Close case',
});

export const MARK_CASE_IN_PROGRESS = i18n.translate('xpack.cases.caseView.markInProgress', {
  defaultMessage: 'Mark in progress',
});

export const REOPEN_CASE = i18n.translate('xpack.cases.caseView.reopenCase', {
  defaultMessage: 'Reopen case',
});

export const OPEN_CASE = i18n.translate('xpack.cases.caseView.openCase', {
  defaultMessage: 'Open case',
});

export const CASE_NAME = i18n.translate('xpack.cases.caseView.caseName', {
  defaultMessage: 'Case name',
});

export const TO = i18n.translate('xpack.cases.caseView.to', {
  defaultMessage: 'to',
});

export const TAGS = i18n.translate('xpack.cases.caseView.tags', {
  defaultMessage: 'Tags',
});

export const CATEGORY = i18n.translate('xpack.cases.caseView.category', {
  defaultMessage: 'Category',
});

export const CATEGORIES = i18n.translate('xpack.cases.caseView.categories', {
  defaultMessage: 'Categories',
});

export const SOLUTION = i18n.translate('xpack.cases.caseView.solution', {
  defaultMessage: 'Solution',
});

export const ACTIONS = i18n.translate('xpack.cases.allCases.actions', {
  defaultMessage: 'Actions',
});

export const ACTIONS_BUTTON_ARIA_LABEL = (title: string) =>
  i18n.translate('xpack.cases.allCases.actions.button.ariaLabel', {
    defaultMessage: 'Actions for "{title}" column',
    values: {
      title,
    },
  });

export const NO_TAGS_AVAILABLE = i18n.translate('xpack.cases.allCases.noTagsAvailable', {
  defaultMessage: 'No tags available',
});

export const NO_REPORTERS_AVAILABLE = i18n.translate('xpack.cases.caseView.noReportersAvailable', {
  defaultMessage: 'No reporters available.',
});

export const NO_CATEGORIES_AVAILABLE = i18n.translate(
  'xpack.cases.allCases.noCategoriesAvailable',
  {
    defaultMessage: 'No categories available',
  }
);

export const COMMENTS = i18n.translate('xpack.cases.allCases.comments', {
  defaultMessage: 'Comments',
});

export const TAGS_HELP = i18n.translate('xpack.cases.createCase.fieldTagsHelpText', {
  defaultMessage: 'Separate tags with a line break.',
});

export const TAGS_EMPTY_ERROR = i18n.translate('xpack.cases.createCase.fieldTagsEmptyError', {
  defaultMessage: 'A tag must contain at least one non-space character.',
});

export const NO_TAGS = i18n.translate('xpack.cases.caseView.noTags', {
  defaultMessage: 'No tags are added',
});

export const NO_CATEGORIES = i18n.translate('xpack.cases.caseView.noCategories', {
  defaultMessage: 'No category is added',
});

export const TITLE_REQUIRED = i18n.translate('xpack.cases.createCase.titleFieldRequiredError', {
  defaultMessage: 'A name is required.',
});

export const CONFIGURE_CASES_BUTTON = i18n.translate('xpack.cases.configureCasesButton', {
  defaultMessage: 'Settings',
});

export const TEMPLATES_BUTTON = i18n.translate('xpack.cases.templatesButton', {
  defaultMessage: 'Templates',
});

export const ADD_COMMENT = i18n.translate('xpack.cases.caseView.comment.addComment', {
  defaultMessage: 'Add comment',
});

export const ADD_COMMENT_HELP_TEXT = i18n.translate(
  'xpack.cases.caseView.comment.addCommentHelpText',
  {
    defaultMessage: 'Add a new comment...',
  }
);

export const SAVE = i18n.translate('xpack.cases.caseView.description.save', {
  defaultMessage: 'Save',
});

export const CONNECTORS = i18n.translate('xpack.cases.caseView.connectors', {
  defaultMessage: 'External incident management system',
});

export const NO_CONNECTOR = i18n.translate('xpack.cases.common.noConnector', {
  defaultMessage: 'No connector selected',
});

export const UNKNOWN = i18n.translate('xpack.cases.caseView.unknown', {
  defaultMessage: 'Unknown',
});

export const MARKED_CASE_AS = i18n.translate('xpack.cases.caseView.markedCaseAs', {
  defaultMessage: 'marked case as',
});

export const ADD_CATEGORY = i18n.translate('xpack.cases.caseView.addCategory', {
  defaultMessage: 'added the category',
});

export const REMOVE_CATEGORY = i18n.translate('xpack.cases.caseView.userAction.removeCategory', {
  defaultMessage: 'removed the category',
});

export const SET_SEVERITY_TO = i18n.translate('xpack.cases.caseView.setSeverityTo', {
  defaultMessage: 'set severity to',
});

export const OPEN_CASES = i18n.translate('xpack.cases.caseTable.openCases', {
  defaultMessage: 'Open cases',
});

export const CLOSED_CASES = i18n.translate('xpack.cases.caseTable.closedCases', {
  defaultMessage: 'Closed cases',
});

export const IN_PROGRESS_CASES = i18n.translate('xpack.cases.caseTable.inProgressCases', {
  defaultMessage: 'In progress cases',
});

export const SYNC_ALERTS_SWITCH_LABEL_ON = i18n.translate(
  'xpack.cases.settings.syncAlertsSwitchLabelOn',
  {
    defaultMessage: 'On',
  }
);

export const SYNC_ALERTS_SWITCH_LABEL_OFF = i18n.translate(
  'xpack.cases.settings.syncAlertsSwitchLabelOff',
  {
    defaultMessage: 'Off',
  }
);

export const SYNC_ALERTS = i18n.translate('xpack.cases.settings.syncAlerts', {
  defaultMessage: 'Sync Detections',
});

export const SYNC_ALERTS_HELP = i18n.translate('xpack.cases.components.create.syncAlertHelpText', {
  defaultMessage: 'Enabling this option will sync the detection statuses with the case status.',
});

export const EXTRACT_OBSERVABLES_SWITCH_LABEL_ON = i18n.translate(
  'xpack.cases.settings.extractObservablesSwitchLabelOn',
  {
    defaultMessage: 'On',
  }
);

export const EXTRACT_OBSERVABLES_SWITCH_LABEL_OFF = i18n.translate(
  'xpack.cases.settings.extractObservablesSwitchLabelOff',
  {
    defaultMessage: 'Off',
  }
);

export const EXTRACT_OBSERVABLES_LABEL = i18n.translate(
  'xpack.cases.settings.extractObservablesLabel',
  {
    defaultMessage: 'Extract observables',
  }
);

export const EXTRACT_OBSERVABLES_HELP = i18n.translate(
  'xpack.cases.components.create.extractObservablesHelpText',
  {
    defaultMessage: 'Enabling this option will extract observables from the alert automatically.',
  }
);

export const ALERT = i18n.translate('xpack.cases.common.alertLabel', {
  defaultMessage: 'Alert',
});

export const ALERTS = i18n.translate('xpack.cases.common.alertsLabel', {
  defaultMessage: 'Alerts',
});

export const ALERT_ADDED_TO_CASE = i18n.translate('xpack.cases.common.alertAddedToCase', {
  defaultMessage: 'added to case',
});

export const EVENTS = i18n.translate('xpack.cases.common.eventsLabel', {
  defaultMessage: 'Events',
});

export const SELECT_CASE_TITLE = i18n.translate('xpack.cases.common.allCases.caseModal.title', {
  defaultMessage: 'Select case',
});

export const MAX_LENGTH_ERROR = (field: string, length: number) =>
  i18n.translate('xpack.cases.createCase.maxLengthError', {
    values: { field, length },
    defaultMessage:
      'The length of the {field} is too long. The maximum length is {length} characters.',
  });

export const SAFE_INTEGER_NUMBER_ERROR = (field: string) =>
  i18n.translate('xpack.cases.customFields.safeIntegerNumberError', {
    values: { field },
    defaultMessage: `The value of the {field} should be an integer between -(2^53 - 1) and 2^53 - 1, inclusive.`,
  });

export const MAX_TAGS_ERROR = (length: number) =>
  i18n.translate('xpack.cases.createCase.maxTagsError', {
    values: { length },
    defaultMessage: 'Too many tags. The maximum number of allowed tags is {length}',
  });

export const LINK_APPROPRIATE_LICENSE = i18n.translate('xpack.cases.common.appropriateLicense', {
  defaultMessage: 'appropriate license',
});

export const CASE_SUCCESS_TOAST = (title: string) =>
  i18n.translate('xpack.cases.actions.caseSuccessToast', {
    values: { title },
    defaultMessage: 'Case {title} updated',
  });

export const CASE_ALERT_SUCCESS_TOAST = (title: string, quantity: number = 1) =>
  i18n.translate('xpack.cases.actions.caseAlertSuccessToast', {
    values: { quantity, title },
    defaultMessage: '{quantity, plural, =1 {An alert was} other {Alerts were}} added to "{title}"',
  });

export const CASE_ALERT_SUCCESS_SYNC_TEXT = i18n.translate(
  'xpack.cases.actions.caseAlertSuccessSyncText',
  {
    defaultMessage: "Detection statuses were synced with the case's status.",
  }
);

export const CASE_ALERT_SUCCESS_OBSERVABLES_TEXT = i18n.translate(
  'xpack.cases.actions.caseAlertSuccessObservablesText',
  {
    defaultMessage: 'Observables were extracted and added to the case.',
  }
);

export const CASE_ALERT_SUCCESS_SYNC_AND_EXTRACT_TEXT = i18n.translate(
  'xpack.cases.actions.caseAlertSuccessSyncAndExtractText',
  {
    defaultMessage:
      "Detection statuses were synced with the case's status and observables were extracted and added to the case.",
  }
);

export const VIEW_CASE = i18n.translate('xpack.cases.actions.viewCase', {
  defaultMessage: 'View case',
});

export const APP_TITLE = i18n.translate('xpack.cases.common.appTitle', {
  defaultMessage: 'Cases',
});

export const APP_DESC = i18n.translate('xpack.cases.common.appDescription', {
  defaultMessage: 'Open and track issues, push information to third party systems.',
});

export const READ_ACTIONS_PERMISSIONS_ERROR_MSG = i18n.translate(
  'xpack.cases.configure.readPermissionsErrorDescription',
  {
    defaultMessage:
      'You do not have permission to view connectors. If you would like to view connectors, contact your Kibana administrator.',
  }
);

export const DELETED_CASES = (totalCases: number) =>
  i18n.translate('xpack.cases.containers.deletedCases', {
    values: { totalCases },
    defaultMessage: 'Deleted {totalCases, plural, =1 {case} other {{totalCases} cases}}',
  });

export const ADD_TAG_CUSTOM_OPTION_LABEL = (searchValue: string) =>
  i18n.translate('xpack.cases.configure.addTagCustomOptionLabel', {
    defaultMessage: 'Add {searchValue} as a tag',
    values: { searchValue },
  });

export const ADD_CATEGORY_CUSTOM_OPTION_LABEL = (searchValue: string) =>
  i18n.translate('xpack.cases.configure.addCategoryCustomOptionLabel', {
    defaultMessage: 'Add {searchValue} as a category',
    values: { searchValue },
  });

export const VERSION_CONFLICT_WARNING = (markdownId: string) =>
  i18n.translate('xpack.cases.configure.commentVersionConflictWarning', {
    defaultMessage:
      'This {markdownId} has been updated by another user. Saving your {markdownId} will overwrite their update.',
    values: { markdownId },
  });

/**
 * EUI checkbox replace {searchValue} with the current
 * search value. We need to put the template variable
 * searchValue in the string but not replace it
 * with i18n.
 */
export const ADD_TAG_CUSTOM_OPTION_LABEL_COMBO_BOX = ADD_TAG_CUSTOM_OPTION_LABEL('{searchValue}');

export const ADD_CATEGORY_CUSTOM_OPTION_LABEL_COMBO_BOX =
  ADD_CATEGORY_CUSTOM_OPTION_LABEL('{searchValue}');

export const EXPERIMENTAL_LABEL = i18n.translate('xpack.cases.badge.experimentalLabel', {
  defaultMessage: 'Technical preview',
});

export const EXPERIMENTAL_DESC = i18n.translate('xpack.cases.badge.experimentalDesc', {
  defaultMessage:
    'This functionality is in technical preview and may be changed or removed completely in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.',
});
