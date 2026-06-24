/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const NO_TEMPLATES = i18n.translate('xpack.cases.templates.noTemplates', {
  defaultMessage: 'You do not have any templates yet',
});

export const CREATE_TEMPLATE = i18n.translate('xpack.cases.templates.create', {
  defaultMessage: 'Create',
});

export const SAVE_TEMPLATE = i18n.translate('xpack.cases.templates.save', {
  defaultMessage: 'Save',
});

export const ADD_TEMPLATE_TITLE = i18n.translate('xpack.cases.templates.addTemplateTitle', {
  defaultMessage: 'Add template',
});

export const EDIT_TEMPLATE_TITLE = i18n.translate('xpack.cases.templates.editTemplateTitle', {
  defaultMessage: 'Edit template',
});

export const BACK_TO_TEMPLATES = i18n.translate('xpack.cases.templates.backToTemplates', {
  defaultMessage: 'Back to Templates',
});

export const TEMPLATE_FIELDS_LABEL = i18n.translate('xpack.cases.templates.templateFieldsLabel', {
  defaultMessage: 'Fields',
});

export const TEMPLATE_SAVED = i18n.translate('xpack.cases.templates.templateSaved', {
  defaultMessage: 'Saved',
});

export const VALIDATION_LOADING_EDITOR = i18n.translate(
  'xpack.cases.templates.validation.loadingEditor',
  {
    defaultMessage: 'Loading editor...',
  }
);

export const VALIDATION_NO_ERRORS = i18n.translate('xpack.cases.templates.validation.noErrors', {
  defaultMessage: 'No validation errors',
});

export const REVERT_TO_DEFAULT = i18n.translate('xpack.cases.templates.revertToDefault', {
  defaultMessage: 'Revert to default template',
});

export const REVERT_TO_LAST_SAVED = i18n.translate('xpack.cases.templates.revertToLastSaved', {
  defaultMessage: 'Revert to last saved version',
});

export const REVERT_MODAL_TITLE = i18n.translate('xpack.cases.templates.revertModalTitle', {
  defaultMessage: 'Revert changes?',
});

export const REVERT_MODAL_BODY = i18n.translate('xpack.cases.templates.revertModalBody', {
  defaultMessage: 'All unsaved changes will be lost. This action cannot be undone.',
});

export const REVERT_MODAL_CONFIRM = i18n.translate('xpack.cases.templates.revertModalConfirm', {
  defaultMessage: 'Revert',
});

export const REVERT_MODAL_CANCEL = i18n.translate('xpack.cases.templates.revertModalCancel', {
  defaultMessage: 'Cancel',
});

export const FIX_VALIDATION_ERRORS = i18n.translate('xpack.cases.templates.fixValidationErrors', {
  defaultMessage: 'Please fix validation errors before saving.',
});

export const UNSAVED_CHANGES = i18n.translate('xpack.cases.templates.unsavedChanges', {
  defaultMessage: 'Unsaved changes',
});

export const FAILED_TO_SAVE_TEMPLATE = i18n.translate(
  'xpack.cases.templates.failedToSaveTemplate',
  {
    defaultMessage: 'Failed to save template',
  }
);

export const FIELD_REQUIRED = i18n.translate('xpack.cases.templates.fieldValidation.required', {
  defaultMessage: 'Required',
});

export const FIELD_MIN_VALUE = (min: number) =>
  i18n.translate('xpack.cases.templates.fieldValidation.minValue', {
    defaultMessage: 'Value must be at least {min}',
    values: { min },
  });

export const FIELD_MAX_VALUE = (max: number) =>
  i18n.translate('xpack.cases.templates.fieldValidation.maxValue', {
    defaultMessage: 'Value must be at most {max}',
    values: { max },
  });

export const FIELD_MIN_LENGTH = (min: number) =>
  i18n.translate('xpack.cases.templates.fieldValidation.minLength', {
    defaultMessage: 'Must be at least {min} characters',
    values: { min },
  });

export const FIELD_MAX_LENGTH = (max: number) =>
  i18n.translate('xpack.cases.templates.fieldValidation.maxLength', {
    defaultMessage: 'Must be at most {max} characters',
    values: { max },
  });

export const FIELD_PATTERN_MISMATCH = (regex: string) =>
  i18n.translate('xpack.cases.templates.fieldValidation.patternMismatch', {
    defaultMessage: 'Value does not match pattern: {regex}',
    values: { regex },
  });

export const FIELD_PATTERN_INVALID = i18n.translate(
  'xpack.cases.templates.fieldValidation.patternInvalid',
  {
    defaultMessage: 'Pattern is not a valid regular expression',
  }
);

export const INVALID_USER_PROFILES = (names: string[]) =>
  i18n.translate('xpack.cases.templates.fieldValidation.invalidUserProfiles', {
    defaultMessage: 'The following users do not exist and must be removed: {names}',
    values: { names: names.join(', ') },
  });

export const INVALID_USER_PICKER_DEFAULT = (name: string) =>
  i18n.translate('xpack.cases.templates.fieldValidation.invalidUserPickerDefault', {
    defaultMessage: 'User "{name}" in default values was not found or has changed.',
    values: { name },
  });

export const TEMPLATE_ENABLED = i18n.translate('xpack.cases.templates.enabled', {
  defaultMessage: 'Enabled',
});

export const TEMPLATE_DISABLED = i18n.translate('xpack.cases.templates.disabled', {
  defaultMessage: 'Disabled',
});

export const COLUMN_ENABLED = i18n.translate('xpack.cases.templates.columnEnabled', {
  defaultMessage: 'Enabled',
});

export const TEMPLATE_ENABLED_CAN_CREATE_CASES = i18n.translate(
  'xpack.cases.templates.enabledCanCreateCases',
  {
    defaultMessage: 'This template is enabled and can be used to create new cases.',
  }
);

export const TEMPLATE_DISABLED_CANNOT_CREATE_CASES = i18n.translate(
  'xpack.cases.templates.disabledCannotCreateCases',
  {
    defaultMessage: 'If the template is disabled, it cannot be used to create new cases.',
  }
);

export const SHOW_ONLY_DISABLED = i18n.translate('xpack.cases.templates.showOnlyDisabled', {
  defaultMessage: 'Show only disabled',
});

export const STATUS = i18n.translate('xpack.cases.templates.status', {
  defaultMessage: 'Status',
});

export const SHOW_ALL = i18n.translate('xpack.cases.templates.showAll', {
  defaultMessage: 'Show all',
});

export const ERROR_FETCHING_TEMPLATES = i18n.translate(
  'xpack.cases.templates.errorFetchingTemplates',
  {
    defaultMessage: 'Error fetching templates',
  }
);

export const ERROR_FETCHING_TEMPLATE_TAGS = i18n.translate(
  'xpack.cases.templates.errorFetchingTemplateTags',
  {
    defaultMessage: 'Error fetching template tags',
  }
);

export const ERROR_FETCHING_TEMPLATE_CREATORS = i18n.translate(
  'xpack.cases.templates.errorFetchingTemplateCreators',
  {
    defaultMessage: 'Error fetching template creators',
  }
);

export const ERROR_CREATING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.errorCreatingTemplate',
  {
    defaultMessage: 'Error creating template',
  }
);

export const SUCCESS_CREATING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.successCreatingTemplate',
  {
    defaultMessage: 'Template created successfully',
  }
);

export const ERROR_UPDATING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.errorUpdatingTemplate',
  {
    defaultMessage: 'Error updating template',
  }
);

export const SUCCESS_UPDATING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.successUpdatingTemplate',
  {
    defaultMessage: 'Template updated successfully',
  }
);

export const SUCCESS_CLONING_TEMPLATE = (templateName: string) =>
  i18n.translate('xpack.cases.templates.successCloningTemplate', {
    defaultMessage: '{templateName} was cloned successfully',
    values: { templateName },
  });

export const CLONED_TEMPLATE_NAME_PREFIX = (templateName: string) =>
  i18n.translate('xpack.cases.templates.clonedTemplateNamePrefix', {
    defaultMessage: 'Cloned: {templateName}',
    values: { templateName },
  });

export const ERROR_DELETING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.errorDeletingTemplate',
  {
    defaultMessage: 'Error deleting template',
  }
);

export const SUCCESS_DELETING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.successDeletingTemplate',
  {
    defaultMessage: 'Template deleted successfully',
  }
);

export const ERROR_EXPORTING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.errorExportingTemplate',
  {
    defaultMessage: 'Error exporting template',
  }
);

export const SUCCESS_EXPORTING_TEMPLATE = i18n.translate(
  'xpack.cases.templates.successExportingTemplate',
  {
    defaultMessage: 'Template exported successfully',
  }
);

export const ERROR_BULK_DELETING_TEMPLATES = i18n.translate(
  'xpack.cases.templates.errorBulkDeletingTemplates',
  {
    defaultMessage: 'Error deleting templates',
  }
);

export const SUCCESS_BULK_DELETING_TEMPLATES = (count: number) =>
  i18n.translate('xpack.cases.templates.successBulkDeletingTemplates', {
    values: { count },
    defaultMessage: '{count, plural, one {# template} other {# templates}} deleted successfully',
  });

export const ERROR_BULK_EXPORTING_TEMPLATES = i18n.translate(
  'xpack.cases.templates.errorBulkExportingTemplates',
  {
    defaultMessage: 'Error exporting templates',
  }
);

export const SUCCESS_BULK_EXPORTING_TEMPLATES = (count: number) =>
  i18n.translate('xpack.cases.templates.successBulkExportingTemplates', {
    values: { count },
    defaultMessage: '{count, plural, one {# template} other {# templates}} exported successfully',
  });

// Table column names
export const COLUMN_NAME = i18n.translate('xpack.cases.templates.column.name', {
  defaultMessage: 'Name',
});

export const COLUMN_DESCRIPTION = i18n.translate('xpack.cases.templates.column.description', {
  defaultMessage: 'Description',
});

export const COLUMN_SOLUTION = i18n.translate('xpack.cases.templates.column.solution', {
  defaultMessage: 'Solution',
});

export const COLUMN_FIELDS = i18n.translate('xpack.cases.templates.column.fields', {
  defaultMessage: 'Fields',
});

export const COLUMN_TAGS = i18n.translate('xpack.cases.templates.column.tags', {
  defaultMessage: 'Tags',
});

export const COLUMN_CATEGORY = i18n.translate('xpack.cases.templates.column.category', {
  defaultMessage: 'Category',
});

export const COLUMN_SEVERITY = i18n.translate('xpack.cases.templates.column.severity', {
  defaultMessage: 'Severity',
});

export const COLUMN_AUTHOR = i18n.translate('xpack.cases.templates.column.author', {
  defaultMessage: 'Author',
});

export const CLOSE_PREVIEW = i18n.translate('xpack.cases.templates.closePreview', {
  defaultMessage: 'Close preview',
});

export const COLUMN_LAST_UPDATE = i18n.translate('xpack.cases.templates.column.lastUpdate', {
  defaultMessage: 'Last update',
});

export const COLUMN_LAST_TIME_USED = i18n.translate('xpack.cases.templates.column.lastTimeUsed', {
  defaultMessage: 'Last time used',
});

export const COLUMN_USAGE = i18n.translate('xpack.cases.templates.column.usage', {
  defaultMessage: 'Usage',
});

// Actions
export const ACTIONS = i18n.translate('xpack.cases.templates.actions', {
  defaultMessage: 'Actions',
});

export const EDIT_TEMPLATE = i18n.translate('xpack.cases.templates.editTemplate', {
  defaultMessage: 'Edit',
});

export const CLONE_TEMPLATE = i18n.translate('xpack.cases.templates.cloneTemplate', {
  defaultMessage: 'Clone',
});

export const EXPORT_TEMPLATE = i18n.translate('xpack.cases.templates.exportTemplate', {
  defaultMessage: 'Export',
});

export const PREVIEW_TEMPLATE = i18n.translate('xpack.cases.templates.previewTemplate', {
  defaultMessage: 'Preview',
});

export const DELETE_TEMPLATE = i18n.translate('xpack.cases.templates.deleteTemplate', {
  defaultMessage: 'Delete',
});

export const SHOWING_TEMPLATES = (total: number) =>
  i18n.translate('xpack.cases.templates.showingTemplates', {
    values: { total },
    defaultMessage: 'of {total}',
  });

export const SHOWING_SELECTED_TEMPLATES = (count: number) =>
  i18n.translate('xpack.cases.templates.selectedTemplatesTitle', {
    values: { count },
    defaultMessage: 'Selected {count} {count, plural, =1 {template} other {templates}}',
  });

export const CLEAR_FILTERS = i18n.translate('xpack.cases.templates.clearFilters', {
  defaultMessage: 'Clear filters',
});

export const BULK_ACTIONS = i18n.translate('xpack.cases.templates.bulkActions', {
  defaultMessage: 'Bulk actions',
});

export const BULK_EXPORT_TEMPLATES = i18n.translate('xpack.cases.templates.bulkExportTemplates', {
  defaultMessage: 'Export',
});

export const BULK_DELETE_TEMPLATES = i18n.translate('xpack.cases.templates.bulkDeleteTemplates', {
  defaultMessage: 'Delete',
});

export const BULK_DELETE_TITLE = (count: number) =>
  i18n.translate('xpack.cases.templates.bulkDeleteTitle', {
    values: { count },
    defaultMessage: 'Delete {count, plural, one {# template} other {# templates}}?',
  });

export const BULK_DELETE_MESSAGE = (count: number) =>
  i18n.translate('xpack.cases.templates.bulkDeleteMessage', {
    values: { count },
    defaultMessage:
      'This action will permanently delete {count, plural, one {this template} other {these {count} templates}}.',
  });

export const SHOWING = i18n.translate('xpack.cases.templates.showing', {
  defaultMessage: 'Showing',
});

export const CASE = i18n.translate('xpack.cases.templates.case', {
  defaultMessage: 'Case',
});

export const CASES = i18n.translate('xpack.cases.templates.cases', {
  defaultMessage: 'Cases',
});

export const DELETE_TITLE = (name: string) =>
  i18n.translate('xpack.cases.configuration.deleteTitle', {
    values: { name },
    defaultMessage: 'Delete {name}?',
  });

export const DELETE_MESSAGE = (name: string) =>
  i18n.translate('xpack.cases.configuration.deleteMessage', {
    values: { name },
    defaultMessage: 'This action will permanently delete {name}.',
  });
export const NO_TEMPLATES_BODY = i18n.translate('xpack.cases.templates.noTemplatesBody', {
  defaultMessage: 'Create templates that automatically populate values in new cases.',
});

export const NO_TEMPLATES_MATCH_FILTERS = i18n.translate(
  'xpack.cases.templates.noTemplatesMatchFilters',
  {
    defaultMessage: 'No templates match your search criteria',
  }
);

export const NO_TEMPLATES_MATCH_FILTERS_BODY = i18n.translate(
  'xpack.cases.templates.noTemplatesMatchFiltersBody',
  {
    defaultMessage: 'Try modifying your search or filters.',
  }
);

export const SEARCH_TEMPLATES = i18n.translate('xpack.cases.templates.searchTemplates', {
  defaultMessage: 'Search templates',
});

export const SEARCH_TEMPLATES_PLACEHOLDER = i18n.translate(
  'xpack.cases.templates.searchPlaceholder',
  {
    defaultMessage: 'Search by name, description, or field name',
  }
);

export const REFRESH_TEMPLATES = i18n.translate('xpack.cases.templates.refreshTemplates', {
  defaultMessage: 'Refresh templates',
});

export const TAGS = i18n.translate('xpack.cases.templates.tags', {
  defaultMessage: 'Tags',
});

export const CREATED_BY = i18n.translate('xpack.cases.templates.createdBy', {
  defaultMessage: 'Created by',
});

export const TEMPLATES_INFO_TITLE = i18n.translate('xpack.cases.templates.infoTitle', {
  defaultMessage: 'Create custom templates for your needs',
});

export const TEMPLATES_INFO_DESCRIPTION = i18n.translate('xpack.cases.templates.infoDescription', {
  defaultMessage:
    'Create templates with custom set of fields, that can automatically populate values in new cases.',
});

export const LEARN_MORE = i18n.translate('xpack.cases.templates.learnMore', {
  defaultMessage: 'Learn more',
});

export const ADD_TEMPLATE = i18n.translate('xpack.cases.templates.addTemplate', {
  defaultMessage: 'Add template',
});

export const IMPORT_TEMPLATE = i18n.translate('xpack.cases.templates.importTemplate', {
  defaultMessage: 'Import template',
});

export const IMPORT_TEMPLATE_DESCRIPTION = i18n.translate(
  'xpack.cases.templates.importTemplateDescription',
  {
    defaultMessage: 'Requires YAML format upload',
  }
);

export const IMPORT_SELECTED = (count: number) =>
  i18n.translate('xpack.cases.templates.importSelected', {
    values: { count },
    defaultMessage: 'Import {count} {count, plural, one {template} other {templates}}',
  });

export const SUCCESS_IMPORTING_TEMPLATES = (created: number, updated: number) =>
  i18n.translate('xpack.cases.templates.successImportingTemplates', {
    values: { created, updated },
    defaultMessage:
      'Successfully imported: {created, plural, one {# template created} other {# templates created}}, {updated, plural, one {# template updated} other {# templates updated}}',
  });

export const ERROR_IMPORTING_TEMPLATES = i18n.translate(
  'xpack.cases.templates.errorImportingTemplates',
  {
    defaultMessage: 'Failed to import templates',
  }
);

export const IMPORT_PARTIAL_FAILURE = (succeeded: number, failed: number) =>
  i18n.translate('xpack.cases.templates.importPartialFailure', {
    values: { succeeded, failed },
    defaultMessage:
      '{succeeded, plural, one {# template} other {# templates}} imported, {failed, plural, one {# template} other {# templates}} failed',
  });

export const CANCEL = i18n.translate('xpack.cases.templates.cancel', {
  defaultMessage: 'Cancel',
});

export const STEP_UPLOAD_YAML = i18n.translate('xpack.cases.templates.stepUploadYaml', {
  defaultMessage: 'Upload YAML files',
});

export const STEP_SELECT_TEMPLATES = i18n.translate('xpack.cases.templates.stepSelectTemplates', {
  defaultMessage: 'Select templates',
});

export const NEXT = i18n.translate('xpack.cases.templates.next', {
  defaultMessage: 'Next',
});

export const BACK = i18n.translate('xpack.cases.templates.back', {
  defaultMessage: 'Back',
});

export const FILE_PICKER_PROMPT = i18n.translate('xpack.cases.templates.filePickerPrompt', {
  defaultMessage: 'Select or drag and drop multiple YAML files',
});

export const VALIDATION_ERRORS_TITLE = i18n.translate(
  'xpack.cases.templates.validationErrorsTitle',
  {
    defaultMessage: 'Some files could not be validated',
  }
);

export const FILES_VALIDATED = (count: number) =>
  i18n.translate('xpack.cases.templates.filesValidated', {
    values: { count },
    defaultMessage: '{count} {count, plural, one {file} other {files}} validated successfully',
  });

export const NEW_TEMPLATES_DETECTED = (count: number) =>
  i18n.translate('xpack.cases.templates.newTemplatesDetected', {
    values: { count },
    defaultMessage: '{count} new {count, plural, one {template} other {templates}} detected',
  });

export const OVERLAPPING_TEMPLATES_DETECTED = (count: number) =>
  i18n.translate('xpack.cases.templates.overlappingTemplatesDetected', {
    values: { count },
    defaultMessage:
      '{count} overlapping {count, plural, one {template} other {templates}} detected',
  });

export const OVERLAPPING_TEMPLATES_NOTE = i18n.translate(
  'xpack.cases.templates.overlappingTemplatesNote',
  {
    defaultMessage:
      'These templates already exist and will be saved as a new version of the existing template.',
  }
);

export const PARSE_ERRORS_TITLE = i18n.translate('xpack.cases.templates.parseErrorsTitle', {
  defaultMessage: 'Some templates could not be parsed',
});

export const NO_TEMPLATES_FOUND = i18n.translate('xpack.cases.templates.noTemplatesFound', {
  defaultMessage: 'No templates found',
});

export const NO_TEMPLATES_FOUND_BODY = i18n.translate(
  'xpack.cases.templates.noTemplatesFoundBody',
  {
    defaultMessage:
      'The uploaded files do not contain any valid templates. Please check the YAML format and try again.',
  }
);

export const INVALID_FILE_TYPE = (fileName: string) =>
  i18n.translate('xpack.cases.templates.invalidFileType', {
    values: { fileName },
    defaultMessage: '{fileName}: invalid file type. Only .yaml and .yml files are accepted.',
  });

export const FILE_TOO_LARGE = (fileName: string, maxSize: string) =>
  i18n.translate('xpack.cases.templates.fileTooLarge', {
    values: { fileName, maxSize },
    defaultMessage: '{fileName}: file exceeds the maximum allowed size of {maxSize}.',
  });

export const TOO_MANY_FILES = (max: number) =>
  i18n.translate('xpack.cases.templates.tooManyFiles', {
    values: { max },
    defaultMessage: 'Too many files. A maximum of {max} files can be uploaded at once.',
  });

export const INVALID_FILE_NAME = (fileName: string) =>
  i18n.translate('xpack.cases.templates.invalidFileName', {
    values: { fileName },
    defaultMessage: '{fileName}: file name contains invalid characters.',
  });

export const EMPTY_FILE = (fileName: string) =>
  i18n.translate('xpack.cases.templates.emptyFile', {
    values: { fileName },
    defaultMessage: '{fileName}: file is empty.',
  });

export const INVALID_YAML_SYNTAX = (fileName: string, reason: string) =>
  i18n.translate('xpack.cases.templates.invalidYamlSyntax', {
    values: { fileName, reason },
    defaultMessage: '{fileName}: invalid YAML syntax. {reason}',
  });

export const TOO_MANY_TEMPLATES_IN_FILE = (fileName: string, max: number) =>
  i18n.translate('xpack.cases.templates.tooManyTemplatesInFile', {
    values: { fileName, max },
    defaultMessage:
      '{fileName}: file contains more than {max} templates. Only the first {max} will be processed.',
  });

export const TOO_MANY_TEMPLATES_TOTAL = (max: number) =>
  i18n.translate('xpack.cases.templates.tooManyTemplatesTotal', {
    values: { max },
    defaultMessage: 'You can import a maximum of {max} templates at a time.',
  });

export const TEMPLATE_VALIDATION_ERROR = (fileName: string, index: number, issues: string) =>
  i18n.translate('xpack.cases.templates.templateValidationError', {
    values: { fileName, index, issues },
    defaultMessage: '{fileName}, template {index}: validation failed. {issues}',
  });

export const TEMPLATE_TITLE = i18n.translate('xpack.cases.templates.title', {
  defaultMessage: 'Templates',
});

export const CONFIRM_FIELD_EDIT = i18n.translate('xpack.cases.templates.confirmFieldEdit', {
  defaultMessage: 'Save field',
});

export const CANCEL_FIELD_EDIT = i18n.translate('xpack.cases.templates.cancelFieldEdit', {
  defaultMessage: 'Cancel field edit',
});

export const FIELD_TYPE_TITLE_INPUT_TEXT = i18n.translate(
  'xpack.cases.templates.fieldType.inputText',
  { defaultMessage: 'Text Input' }
);

export const FIELD_TYPE_TITLE_INPUT_NUMBER = i18n.translate(
  'xpack.cases.templates.fieldType.inputNumber',
  { defaultMessage: 'Number Input' }
);

export const FIELD_TYPE_TITLE_SELECT_BASIC = i18n.translate(
  'xpack.cases.templates.fieldType.selectBasic',
  { defaultMessage: 'Select' }
);

export const FIELD_TYPE_TITLE_TEXTAREA = i18n.translate(
  'xpack.cases.templates.fieldType.textarea',
  { defaultMessage: 'Textarea' }
);

export const FIELD_TYPE_TITLE_DATE_PICKER = i18n.translate(
  'xpack.cases.templates.fieldType.datePicker',
  { defaultMessage: 'Date Picker' }
);

export const FIELD_TYPE_TITLE_CHECKBOX_GROUP = i18n.translate(
  'xpack.cases.templates.fieldType.checkboxGroup',
  { defaultMessage: 'Checkbox Group' }
);

export const FIELD_TYPE_TITLE_RADIO_GROUP = i18n.translate(
  'xpack.cases.templates.fieldType.radioGroup',
  { defaultMessage: 'Radio Group' }
);

export const FIELD_TYPE_TITLE_USER_PICKER = i18n.translate(
  'xpack.cases.templates.fieldType.userPicker',
  { defaultMessage: 'User Picker' }
);

export const TEMPLATE_DEFINITION_EMPTY = i18n.translate(
  'xpack.cases.templates.templateDefinitionEmpty',
  { defaultMessage: 'Template definition is empty' }
);

export const INVALID_YAML_NON_OBJECT = i18n.translate(
  'xpack.cases.templates.invalidYamlNonObject',
  { defaultMessage: 'Invalid YAML: parsed to null or non-object' }
);

export const INVALID_YAML_DEFINITION = i18n.translate(
  'xpack.cases.templates.invalidYamlDefinition',
  { defaultMessage: 'Invalid YAML definition' }
);
