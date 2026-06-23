/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const CREATE_CASE_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.createCase.label', {
  defaultMessage: 'Cases - Create case',
});

export const CREATE_CASE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.createCase.description',
  {
    defaultMessage: 'Creates a new case with the specified attributes',
  }
);

export const CREATE_CASE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.createCase.documentation.details',
  {
    defaultMessage:
      'This step creates a new case in the cases system. You can specify title, description, tags, assignees, severity, category, connector configuration, sync settings, and custom fields. The step returns the complete created case object.',
  }
);

export const CREATE_CASE_FROM_TEMPLATE_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.createCaseFromTemplate.label',
  {
    defaultMessage: 'Cases - Create case from template',
  }
);

export const CREATE_CASE_FROM_TEMPLATE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.createCaseFromTemplate.description',
  {
    defaultMessage:
      'Creates a new security case using a configured case template and optional overwrites',
  }
);

export const CREATE_CASE_FROM_TEMPLATE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.createCaseFromTemplate.documentation.details',
  {
    defaultMessage:
      'This step resolves a case template from the securitySolution case configuration and creates a new case. You can optionally specify overwrite fields to customize the created case.',
  }
);

export const UPDATE_CASE_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.updateCase.label', {
  defaultMessage: 'Cases - Update case',
});

export const UPDATE_CASE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.updateCase.description',
  {
    defaultMessage: 'Updates a case with the specified fields',
  }
);

export const UPDATE_CASE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.updateCase.documentation.details',
  {
    defaultMessage:
      'This step updates a case using the specified fields. If a version is specified, it is used directly. Otherwise, the step fetches the case to resolve the latest version before updating.',
  }
);

export const UPDATE_CASES_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.updateCases.label',
  {
    defaultMessage: 'Cases - Update cases',
  }
);

export const UPDATE_CASES_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.updateCases.description',
  {
    defaultMessage: 'Updates multiple cases in one step',
  }
);

export const UPDATE_CASES_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.updateCases.documentation.details',
  {
    defaultMessage:
      'This step updates multiple cases at once. Each case can specify a version directly or let the step fetch the latest version before applying updates.',
  }
);

export const SET_CUSTOM_FIELD_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.setCustomField.label',
  {
    defaultMessage: 'Cases - Set custom field',
  }
);

export const SET_CUSTOM_FIELD_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.setCustomField.description',
  {
    defaultMessage: 'Sets a single custom field value on an existing case',
  }
);

export const SET_CUSTOM_FIELD_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.setCustomField.documentation.details',
  {
    defaultMessage:
      'This step updates one custom field on a case by field name. Use `field_name` to select the field key and `value` to set the new value.',
  }
);

export const ADD_COMMENT_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.addComment.label', {
  defaultMessage: 'Cases - Add comment',
});

export const ADD_COMMENT_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.addComment.description',
  {
    defaultMessage: 'Adds a comment to a case',
  }
);

export const ADD_COMMENT_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.addComment.documentation.details',
  {
    defaultMessage: 'This step appends a new comment to the selected case.',
  }
);

export const GET_CASE_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.getCase.label', {
  defaultMessage: 'Cases - Get case by ID',
});

export const GET_CASE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.getCase.description',
  {
    defaultMessage: 'Retrieves a case using its unique identifier',
  }
);

export const GET_CASE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.getCase.documentation.details',
  {
    defaultMessage:
      'This step retrieves a complete case object from the cases system using its ID. You can optionally include comments and attachments in the response.',
  }
);

export const FIND_CASES_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.findCases.label', {
  defaultMessage: 'Cases - Find cases',
});

export const FIND_CASES_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.findCases.description',
  {
    defaultMessage: 'Searches and filters cases',
  }
);

export const FIND_CASES_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.findCases.documentation.details',
  {
    defaultMessage:
      'This step searches cases and returns matching results, including pagination metadata and case status counters.',
  }
);

export const SET_SEVERITY_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.setSeverity.label',
  {
    defaultMessage: 'Cases - Set case severity',
  }
);

export const SET_SEVERITY_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.setSeverity.description',
  {
    defaultMessage: 'Sets severity for an existing case',
  }
);

export const SET_SEVERITY_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.setSeverity.documentation.details',
  {
    defaultMessage:
      'This step sets only the severity field of an existing case. If version is not specified, the latest case version is resolved automatically.',
  }
);

export const SET_STATUS_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.setStatus.label', {
  defaultMessage: 'Cases - Set case status',
});

export const SET_STATUS_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.setStatus.description',
  {
    defaultMessage: 'Sets status for an existing case',
  }
);

export const SET_STATUS_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.setStatus.documentation.details',
  {
    defaultMessage:
      'This step sets only the status field of an existing case. If version is not specified, the latest case version is resolved automatically.',
  }
);

export const CLOSE_CASE_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.closeCase.label', {
  defaultMessage: 'Cases - Close case',
});

export const CLOSE_CASE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.closeCase.description',
  {
    defaultMessage: 'Closes an existing case',
  }
);

export const CLOSE_CASE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.closeCase.documentation.details',
  {
    defaultMessage:
      'This step closes an existing case by setting its status to `closed`. If version is not specified, the latest case version is resolved automatically.',
  }
);

export const DELETE_CASES_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.deleteCases.label',
  {
    defaultMessage: 'Cases - Delete cases',
  }
);

export const DELETE_CASES_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.deleteCases.description',
  {
    defaultMessage: 'Deletes one or more cases',
  }
);

export const DELETE_CASES_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.deleteCases.documentation.details',
  {
    defaultMessage:
      'This step deletes the specified cases, including their comments and user action history.',
  }
);

export const ASSIGN_CASE_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.assignCase.label', {
  defaultMessage: 'Cases - Assign case',
});

export const ASSIGN_CASE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.assignCase.description',
  {
    defaultMessage: 'Assigns users to an existing case',
  }
);

export const ASSIGN_CASE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.assignCase.documentation.details',
  {
    defaultMessage: 'This step assigns the specified users to an existing case.',
  }
);

export const UNASSIGN_CASE_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.unassignCase.label',
  {
    defaultMessage: 'Cases - Unassign case',
  }
);

export const UNASSIGN_CASE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.unassignCase.description',
  {
    defaultMessage: 'Removes assignees from an existing case',
  }
);

export const UNASSIGN_CASE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.unassignCase.documentation.details',
  {
    defaultMessage:
      'This step removes the specified assignees from an existing case. Specify an empty array to clear all assignees.',
  }
);

export const ADD_ALERTS_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.addAlerts.label', {
  defaultMessage: 'Cases - Add alerts to case',
});

export const ADD_ALERTS_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.addAlerts.description',
  {
    defaultMessage: 'Adds one or more alerts as case attachments',
  }
);

export const ADD_ALERTS_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.addAlerts.documentation.details',
  {
    defaultMessage:
      'This step adds alert attachments to an existing case. Each alert requires an `alertId` and source `index`; rule metadata is optional.',
  }
);

export const ADD_EVENTS_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.addEvents.label', {
  defaultMessage: 'Cases - Add events to case',
});

export const ADD_EVENTS_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.addEvents.description',
  {
    defaultMessage: 'Adds one or more events as case attachments',
  }
);

export const ADD_EVENTS_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.addEvents.documentation.details',
  {
    defaultMessage:
      'This step adds event attachments to an existing case. Each event requires an `eventId` and source `index`.',
  }
);

export const FIND_SIMILAR_CASES_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.findSimilarCases.label',
  {
    defaultMessage: 'Cases - Find similar cases',
  }
);

export const FIND_SIMILAR_CASES_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.findSimilarCases.description',
  {
    defaultMessage: 'Finds cases similar to the specified case ID',
  }
);

export const FIND_SIMILAR_CASES_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.findSimilarCases.documentation.details',
  {
    defaultMessage:
      'This step returns cases similar to the given case, based on shared observables, with pagination metadata.',
  }
);

export const SET_DESCRIPTION_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.setDescription.label',
  {
    defaultMessage: 'Cases - Set case description',
  }
);

export const SET_DESCRIPTION_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.setDescription.description',
  {
    defaultMessage: 'Sets description for an existing case',
  }
);

export const SET_DESCRIPTION_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.setDescription.documentation.details',
  {
    defaultMessage:
      'This step sets only the description field of an existing case. If version is not specified, the latest case version is resolved automatically.',
  }
);

export const SET_TITLE_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.setTitle.label', {
  defaultMessage: 'Cases - Set case title',
});

export const SET_TITLE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.setTitle.description',
  {
    defaultMessage: 'Sets title for an existing case',
  }
);

export const SET_TITLE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.setTitle.documentation.details',
  {
    defaultMessage:
      'This step sets only the title field of an existing case. If version is not specified, the latest case version is resolved automatically.',
  }
);

export const ADD_OBSERVABLES_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.addObservables.label',
  {
    defaultMessage: 'Cases - Add observables to case',
  }
);

export const ADD_OBSERVABLES_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.addObservables.description',
  {
    defaultMessage: 'Adds one or more observables to a case',
  }
);

export const ADD_OBSERVABLES_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.addObservables.documentation.details',
  {
    defaultMessage:
      'This step adds observables to an existing case using `typeKey`, `value`, and optional description fields.',
  }
);

export const ADD_TAG_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.addTag.label', {
  defaultMessage: 'Cases - Add tag to case',
});

export const ADD_TAG_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.addTag.description',
  {
    defaultMessage: 'Add tags to an existing case',
  }
);

export const ADD_TAG_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.addTag.documentation.details',
  {
    defaultMessage: 'This step adds tags to an existing case.',
  }
);

export const REMOVE_TAG_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.removeTags.label', {
  defaultMessage: 'Cases - Remove tags from case',
});

export const REMOVE_TAG_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.removeTags.description',
  {
    defaultMessage: 'Remove tags from an existing case',
  }
);

export const REMOVE_TAG_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.removeTags.documentation.details',
  {
    defaultMessage: 'This step removes tags from an existing case.',
  }
);

export const ADD_CATEGORY_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.addCategory.label',
  {
    defaultMessage: 'Cases - Set category on a case',
  }
);

export const ADD_CATEGORY_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.addCategory.description',
  {
    defaultMessage: 'Sets the category for an existing case',
  }
);

export const ADD_CATEGORY_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.addCategory.documentation.details',
  {
    defaultMessage:
      'This step sets the category on an existing case. Provide an `owner` property to get auto-completed categories.',
  }
);

export const TEMPLATE_CAN_BE_USED_MESSAGE = (template: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.templateCanBeUsedMessage', {
    defaultMessage: 'Template "{template}" can be used to prefill case attributes.',
    values: { template },
  });

export const TEMPLATE_NOT_FOUND_MESSAGE = (template: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.templateNotFoundMessage', {
    defaultMessage: 'Template "{template}" was not found in case configuration.',
    values: { template },
  });

export const CASE_CAN_BE_USED_MESSAGE = (caseTitle: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.caseCanBeUsedMessage', {
    defaultMessage: 'Case "{caseTitle}" can be used as input.',
    values: { caseTitle },
  });

export const CASE_NOT_FOUND_MESSAGE = (caseId: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.caseNotFoundMessage', {
    defaultMessage: 'Case "{caseId}" was not found.',
    values: { caseId },
  });

export const CASE_TRIGGER_EVENT_SCHEMA_CASE_ID_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.eventSchema.caseId',
  {
    defaultMessage: 'The ID of the case.',
  }
);

export const CASE_TRIGGER_EVENT_SCHEMA_OWNER_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.case.eventSchema.owner',
  {
    defaultMessage: 'The owner of the case.',
  }
);

export const CASE_UPDATED_TRIGGER_EVENT_SCHEMA_UPDATED_FIELDS_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.caseUpdated.eventSchema.updatedFields',
  {
    defaultMessage: 'A list of case fields updated by this operation.',
  }
);

export const CASE_STATUS_UPDATED_TRIGGER_EVENT_SCHEMA_STATUS_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.caseStatusUpdated.eventSchema.status',
  {
    defaultMessage: 'The current status of the case.',
  }
);

export const CASE_STATUS_UPDATED_TRIGGER_EVENT_SCHEMA_PREVIOUS_STATUS_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.caseStatusUpdated.eventSchema.previousStatus',
  {
    defaultMessage: 'The previous status of the case.',
  }
);

export const ATTACHMENTS_ADDED_TRIGGER_EVENT_SCHEMA_ATTACHMENT_IDS_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.attachmentsAdded.eventSchema.attachmentIds',
  {
    defaultMessage: 'The IDs of the attachments that were added (all of the same type).',
  }
);

export const ATTACHMENTS_ADDED_TRIGGER_EVENT_SCHEMA_ATTACHMENT_TYPE_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.attachmentsAdded.eventSchema.attachmentType',
  {
    defaultMessage: 'The type of the attachments that were added (e.g. "comment", "alert").',
  }
);

export const COMMENTS_ADDED_TRIGGER_EVENT_SCHEMA_COMMENT_IDS_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowTriggers.commentsAdded.eventSchema.commentIds',
  {
    defaultMessage: 'The IDs of the comments that were added.',
  }
);

export const CUSTOM_FIELD_CAN_BE_USED_MESSAGE = (fieldName: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.customFieldCanBeUsedMessage', {
    defaultMessage: 'Custom field "{fieldName}" can be updated by this step.',
    values: { fieldName },
  });

export const CUSTOM_FIELD_NOT_FOUND_MESSAGE = (fieldName: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.customFieldNotFoundMessage', {
    defaultMessage: 'Custom field "{fieldName}" was not found in case configuration.',
    values: { fieldName },
  });

export const GET_CASES_BY_ALERT_ID_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.getCasesByAlertId.label',
  {
    defaultMessage: 'Cases - Get cases by alert ID',
  }
);

export const GET_CASES_BY_ALERT_ID_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.getCasesByAlertId.description',
  {
    defaultMessage: 'Retrieves all cases that contain a specific alert',
  }
);

export const GET_CASES_BY_ALERT_ID_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.getCasesByAlertId.documentation.details',
  {
    defaultMessage:
      'This step returns all cases that have the given alert attached. Use it to check for duplicates before creating a new case, or to fan-out work across multiple existing cases. An optional owner filter narrows results to a specific solution.',
  }
);

export const GET_ALL_ATTACHMENTS_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.getAllAttachments.label',
  {
    defaultMessage: 'Cases - Get all case attachments',
  }
);

export const GET_ALL_ATTACHMENTS_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.getAllAttachments.description',
  {
    defaultMessage: 'Retrieves all attachments for a case in a single call',
  }
);

export const GET_ALL_ATTACHMENTS_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.getAllAttachments.documentation.details',
  {
    defaultMessage:
      'This step fetches every attachment associated with a case without pagination. Use this when you need the complete set of attachments for decisioning — for example, checking evidence before closing or escalating.',
  }
);

export const UPDATE_OBSERVABLE_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.updateObservable.label',
  {
    defaultMessage: 'Cases - Update observable',
  }
);

export const UPDATE_OBSERVABLE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.updateObservable.description',
  {
    defaultMessage: 'Updates the value and description of an existing observable on a case',
  }
);

export const UPDATE_OBSERVABLE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.updateObservable.documentation.details',
  {
    defaultMessage:
      'This step updates an observable that already exists on a case. Provide the case ID, the observable ID, the new value, and an optional description. The updated case is returned.',
  }
);

export const DELETE_OBSERVABLE_STEP_LABEL = i18n.translate(
  'xpack.cases.workflowSteps.deleteObservable.label',
  {
    defaultMessage: 'Cases - Delete observable',
  }
);

export const DELETE_OBSERVABLE_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.deleteObservable.description',
  {
    defaultMessage: 'Removes an observable from a case',
  }
);

export const DELETE_OBSERVABLE_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.deleteObservable.documentation.details',
  {
    defaultMessage:
      'This step deletes the specified observable from the case. The step echoes back the case_id and observable_id that were removed.',
  }
);

export const CATEGORY_CAN_BE_USED_MESSAGE = (category: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.categoryCanBeUsedMessage', {
    defaultMessage: 'Category "{category}" can be set on the case.',
    values: { category },
  });

export const CATEGORY_NOT_FOUND_MESSAGE = (category: string) =>
  i18n.translate('xpack.cases.workflowSteps.shared.categoryNotFoundMessage', {
    defaultMessage: 'Category "{category}" was not found.',
    values: { category },
  });

export const GET_CASES_STEP_LABEL = i18n.translate('xpack.cases.workflowSteps.getCases.label', {
  defaultMessage: 'Cases - Get cases',
});

export const GET_CASES_STEP_DESCRIPTION = i18n.translate(
  'xpack.cases.workflowSteps.getCases.description',
  {
    defaultMessage: 'Batch-retrieves multiple cases by their IDs in a single call',
  }
);

export const GET_CASES_STEP_DOCUMENTATION_DETAILS = i18n.translate(
  'xpack.cases.workflowSteps.getCases.documentation.details',
  {
    defaultMessage:
      'This step retrieves up to 1000 cases in a single request. Any IDs that could not be fetched are reported in the errors array. Use this to avoid N sequential get operations in fan-out workflows.',
  }
);
