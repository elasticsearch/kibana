/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const ERROR_FETCHING_FIELD_DEFINITIONS = i18n.translate(
  'xpack.cases.fieldLibrary.errorFetchingFieldDefinitions',
  { defaultMessage: 'Failed to fetch field definitions' }
);

export const SUCCESS_CREATING_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.successCreatingFieldDefinition',
  { defaultMessage: 'Field definition created successfully' }
);

export const ERROR_CREATING_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.errorCreatingFieldDefinition',
  { defaultMessage: 'Failed to create field definition' }
);

export const SUCCESS_UPDATING_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.successUpdatingFieldDefinition',
  { defaultMessage: 'Field definition updated successfully' }
);

export const ERROR_UPDATING_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.errorUpdatingFieldDefinition',
  { defaultMessage: 'Failed to update field definition' }
);

export const SUCCESS_DELETING_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.successDeletingFieldDefinition',
  { defaultMessage: 'Field definition deleted successfully' }
);

export const ERROR_DELETING_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.errorDeletingFieldDefinition',
  { defaultMessage: 'Failed to delete field definition' }
);

export const FIELD_LIBRARY_TITLE = i18n.translate('xpack.cases.fieldLibrary.title', {
  defaultMessage: 'Field Library',
});

export const FIELD_LIBRARY_DESCRIPTION = i18n.translate('xpack.cases.fieldLibrary.description', {
  defaultMessage: 'Manage reusable field definitions that can be inserted into case templates.',
});

export const BACK_TO_TEMPLATES = i18n.translate('xpack.cases.fieldLibrary.backToTemplates', {
  defaultMessage: 'Back to templates',
});

export const CREATE_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.createFieldDefinition',
  { defaultMessage: 'Create field definition' }
);

export const EDIT_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.editFieldDefinition',
  { defaultMessage: 'Edit field definition' }
);

export const DELETE_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.deleteFieldDefinition',
  { defaultMessage: 'Delete field definition' }
);

export const COPY_FIELD = i18n.translate('xpack.cases.fieldLibrary.copyField', {
  defaultMessage: 'Copy',
});

export const REFERENCE_FIELD = i18n.translate('xpack.cases.fieldLibrary.referenceField', {
  defaultMessage: 'Reference',
});

export const UNLINK_FIELD = i18n.translate('xpack.cases.fieldLibrary.unlinkField', {
  defaultMessage: 'Unlink',
});

export const LINKED_FIELDS_SECTION_TITLE = i18n.translate(
  'xpack.cases.fieldLibrary.linkedFieldsSectionTitle',
  { defaultMessage: 'Linked fields' }
);

export const INSERT_FIELD = i18n.translate('xpack.cases.fieldLibrary.insertField', {
  defaultMessage: 'Insert',
});

export const FIELD_LIBRARY_PANEL_TITLE = i18n.translate('xpack.cases.fieldLibrary.panelTitle', {
  defaultMessage: 'Field Library',
});

export const FIELD_LIBRARY_PANEL_EMPTY = i18n.translate('xpack.cases.fieldLibrary.panelEmpty', {
  defaultMessage:
    'No reusable field definitions yet. Create some in the Field Library to insert them here.',
});

export const FIELD_ALREADY_EXISTS_ERROR = (fieldName: string) =>
  i18n.translate('xpack.cases.fieldLibrary.fieldAlreadyExistsError', {
    defaultMessage: 'Field "{fieldName}" already exists in this template.',
    values: { fieldName },
  });

export const NAME_COLUMN = i18n.translate('xpack.cases.fieldLibrary.nameColumn', {
  defaultMessage: 'Name',
});

export const DESCRIPTION_COLUMN = i18n.translate('xpack.cases.fieldLibrary.descriptionColumn', {
  defaultMessage: 'Description',
});

export const OWNER_COLUMN = i18n.translate('xpack.cases.fieldLibrary.ownerColumn', {
  defaultMessage: 'Owner',
});

export const ACTIONS_COLUMN = i18n.translate('xpack.cases.fieldLibrary.actionsColumn', {
  defaultMessage: 'Actions',
});

export const FIELD_DEFINITION_FORM_TITLE_CREATE = i18n.translate(
  'xpack.cases.fieldLibrary.formTitleCreate',
  { defaultMessage: 'Create field definition' }
);

export const FIELD_DEFINITION_FORM_TITLE_EDIT = i18n.translate(
  'xpack.cases.fieldLibrary.formTitleEdit',
  { defaultMessage: 'Edit field definition' }
);

export const SAVE_FIELD_DEFINITION = i18n.translate(
  'xpack.cases.fieldLibrary.saveFieldDefinition',
  {
    defaultMessage: 'Save',
  }
);

export const CANCEL = i18n.translate('xpack.cases.fieldLibrary.cancel', {
  defaultMessage: 'Cancel',
});

export const FIELD_DEFINITION_NAME_LABEL = i18n.translate(
  'xpack.cases.fieldLibrary.fieldDefinitionNameLabel',
  { defaultMessage: 'Field name' }
);

export const FIELD_DEFINITION_DESCRIPTION_LABEL = i18n.translate(
  'xpack.cases.fieldLibrary.fieldDefinitionDescriptionLabel',
  { defaultMessage: 'Description' }
);

export const FIELD_DEFINITION_YAML_LABEL = i18n.translate(
  'xpack.cases.fieldLibrary.fieldDefinitionYamlLabel',
  { defaultMessage: 'Field definition (YAML)' }
);

export const FIELD_DEFINITION_YAML_MISSING_NAME = i18n.translate(
  'xpack.cases.fieldLibrary.fieldDefinitionYamlMissingName',
  { defaultMessage: 'The YAML definition must include a `name` property.' }
);

export const FIELD_DEFINITION_PREVIEW_LABEL = i18n.translate(
  'xpack.cases.fieldLibrary.fieldDefinitionPreviewLabel',
  { defaultMessage: 'Preview' }
);

export const FIELD_DEFINITION_PREVIEW_PLACEHOLDER = i18n.translate(
  'xpack.cases.fieldLibrary.fieldDefinitionPreviewPlaceholder',
  { defaultMessage: 'Enter a valid field definition above to see a live preview.' }
);

export const DELETE_CONFIRM_TITLE = i18n.translate('xpack.cases.fieldLibrary.deleteConfirmTitle', {
  defaultMessage: 'Delete field definition?',
});

export const DELETE_CONFIRM_BODY = (name: string) =>
  i18n.translate('xpack.cases.fieldLibrary.deleteConfirmBody', {
    defaultMessage: 'Are you sure you want to delete the field definition "{name}"?',
    values: { name },
  });

export const APPLY_TO_ALL_CASES_LABEL = i18n.translate('xpack.cases.fieldLibrary.isGlobalLabel', {
  defaultMessage: 'Global field',
});

export const APPLY_TO_ALL_CASES_HELP_TEXT = i18n.translate(
  'xpack.cases.fieldLibrary.isGlobalHelpText',
  {
    defaultMessage:
      'When enabled, this field appears in every case regardless of which template is applied.',
  }
);

export const APPLY_TO_ALL_CASES_COLUMN = i18n.translate('xpack.cases.fieldLibrary.isGlobalColumn', {
  defaultMessage: 'Global field',
});

export const GLOBAL_FIELD_YES = i18n.translate('xpack.cases.fieldLibrary.globalFieldYes', {
  defaultMessage: 'Yes',
});

export const GLOBAL_FIELD_NO = i18n.translate('xpack.cases.fieldLibrary.globalFieldNo', {
  defaultMessage: 'No',
});
