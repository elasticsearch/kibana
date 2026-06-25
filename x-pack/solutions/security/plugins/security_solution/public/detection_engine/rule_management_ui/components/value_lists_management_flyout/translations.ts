/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { Type } from '@kbn/securitysolution-io-ts-list-types';

export const VALUE_LISTS_FLYOUT_TITLE = i18n.translate(
  'xpack.securitySolution.lists.importValueListTitle',
  {
    defaultMessage: 'Manage value lists',
  }
);

export const FILE_PICKER_LABEL = i18n.translate(
  'xpack.securitySolution.lists.importValueListDescription',
  {
    defaultMessage: 'Import single value lists to use while writing rule exceptions.',
  }
);

export const FILE_PICKER_PROMPT = i18n.translate(
  'xpack.securitySolution.lists.uploadValueListPrompt',
  {
    defaultMessage: 'Select or drag and drop a file',
  }
);

export const FILE_PICKER_INVALID_FILE_TYPE = (fileTypes: string): string =>
  i18n.translate('xpack.securitySolution.lists.uploadValueListExtensionValidationMessage', {
    values: { fileTypes },
    defaultMessage: 'File must be one of the following types: [{fileTypes}]',
  });

export const CLOSE_BUTTON = i18n.translate(
  'xpack.securitySolution.lists.closeValueListsModalTitle',
  {
    defaultMessage: 'Close',
  }
);

export const CANCEL_BUTTON = i18n.translate(
  'xpack.securitySolution.lists.cancelValueListsImportTitle',
  {
    defaultMessage: 'Cancel import',
  }
);

export const UPLOAD_BUTTON = i18n.translate('xpack.securitySolution.lists.valueListImportButton', {
  defaultMessage: 'Import value list',
});

export const UPLOAD_SUCCESS_TITLE = i18n.translate(
  'xpack.securitySolution.lists.valueListsImportSuccessTitle',
  {
    defaultMessage: 'Value list imported',
  }
);

export const UPLOAD_ERROR = i18n.translate('xpack.securitySolution.lists.valueListsUploadError', {
  defaultMessage: 'There was an error uploading the value list.',
});

export const uploadSuccessMessage = (fileName: string) =>
  i18n.translate('xpack.securitySolution.lists.valueListsImportSuccess', {
    defaultMessage: "Value list ''{fileName}'' was imported",
    values: { fileName },
  });

export const EXPORT_ERROR = i18n.translate('xpack.securitySolution.lists.valueListsExportError', {
  defaultMessage: 'There was an error exporting the value list.',
});

export const COLUMN_FILE_NAME = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.fileNameColumn',
  {
    defaultMessage: 'Filename',
  }
);

export const COLUMN_TYPE = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.typeColumn',
  {
    defaultMessage: 'Type',
  }
);

export const COLUMN_UPLOAD_DATE = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.importDateColumn',
  {
    defaultMessage: 'Import Date',
  }
);

export const COLUMN_CREATED_BY = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.createdByColumn',
  {
    defaultMessage: 'Created by',
  }
);

export const COLUMN_ACTIONS = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.actionsColumn',
  {
    defaultMessage: 'Actions',
  }
);

export const ACTION_EXPORT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.exportActionDescription',
  {
    defaultMessage: 'Export value list',
  }
);

export const ACTION_DELETE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.lists.valueListsTable.deleteActionDescription',
  {
    defaultMessage: 'Remove value list',
  }
);

export const TABLE_TITLE = i18n.translate('xpack.securitySolution.lists.valueListsTable.title', {
  defaultMessage: 'Value lists',
});

export const LIST_TYPES_RADIO_LABEL = i18n.translate(
  'xpack.securitySolution.lists.valueListsForm.listTypesRadioLabel',
  {
    defaultMessage: 'Elasticsearch field type',
  }
);

const valueListTypeDropDownOptionMessages = {
  binary: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeBinaryDropDownOptionLabel',
    defaultMessage: 'Binary',
  },
  boolean: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeBooleanDropDownOptionLabel',
    defaultMessage: 'Boolean',
  },
  byte: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeByteDropDownOptionLabel',
    defaultMessage: 'Byte',
  },
  date: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeDateDropDownOptionLabel',
    defaultMessage: 'Date',
  },
  date_nanos: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeDateNanosDropDownOptionLabel',
    defaultMessage: 'Date (nanoseconds)',
  },
  date_range: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeDateRangeDropDownOptionLabel',
    defaultMessage: 'Date range',
  },
  double: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeDoubleDropDownOptionLabel',
    defaultMessage: 'Double',
  },
  double_range: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeDoubleRangeDropDownOptionLabel',
    defaultMessage: 'Double range',
  },
  float: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeFloatDropDownOptionLabel',
    defaultMessage: 'Float',
  },
  float_range: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeFloatRangeDropDownOptionLabel',
    defaultMessage: 'Float range',
  },
  geo_point: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeGeoPointDropDownOptionLabel',
    defaultMessage: 'Geo point',
  },
  geo_shape: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeGeoShapeDropDownOptionLabel',
    defaultMessage: 'Geo shape',
  },
  half_float: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeHalfFloatDropDownOptionLabel',
    defaultMessage: 'Half float',
  },
  integer: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeIntegerDropDownOptionLabel',
    defaultMessage: 'Integer',
  },
  integer_range: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeIntegerRangeDropDownOptionLabel',
    defaultMessage: 'Integer range',
  },
  ip: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeIpDropDownOptionLabel',
    defaultMessage: 'IP',
  },
  ip_range: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeIpRangeDropDownOptionLabel',
    defaultMessage: 'IP range',
  },
  keyword: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeKeywordDropDownOptionLabel',
    defaultMessage: 'Keyword',
  },
  long: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeLongDropDownOptionLabel',
    defaultMessage: 'Long',
  },
  long_range: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeLongRangeDropDownOptionLabel',
    defaultMessage: 'Long range',
  },
  shape: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeShapeDropDownOptionLabel',
    defaultMessage: 'Shape',
  },
  short: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeShortDropDownOptionLabel',
    defaultMessage: 'Short',
  },
  text: {
    id: 'xpack.securitySolution.lists.valueListsForm.listTypeTextDropDownOptionLabel',
    defaultMessage: 'Text',
  },
} as const satisfies Record<
  Type,
  {
    id: string;
    defaultMessage: string;
  }
>;

/** User-visible label for a value list type in the import type dropdown (Elasticsearch field types). */
export const getListTypeSelectOptionText = (listType: Type): string => {
  const { id, defaultMessage } = valueListTypeDropDownOptionMessages[listType];
  return i18n.translate(id, { defaultMessage });
};

export const REFERENCE_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.lists.referenceModalTitle',
  {
    defaultMessage: 'Remove value list',
  }
);

export const REFERENCE_MODAL_CANCEL_BUTTON = i18n.translate(
  'xpack.securitySolution.lists.referenceModalCancelButton',
  {
    defaultMessage: 'Cancel',
  }
);

export const REFERENCE_MODAL_CONFIRM_BUTTON = i18n.translate(
  'xpack.securitySolution.lists.referenceModalDeleteButton',
  {
    defaultMessage: 'Remove value list',
  }
);

export const referenceErrorMessage = (referenceCount: number) =>
  i18n.translate('xpack.securitySolution.lists.referenceModalDescription', {
    defaultMessage:
      'This value list is associated with ({referenceCount}) exception {referenceCount, plural, =1 {list} other {lists}}. Removing this list will remove all exception items that reference this value list.',
    values: { referenceCount },
  });
