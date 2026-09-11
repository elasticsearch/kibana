/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const importJsonFlyoutStrings = {
  getImportButtonLabel: () =>
    i18n.translate('asCodeImport.importJson.importButton', {
      defaultMessage: 'Import',
    }),
  getCancelButtonLabel: () =>
    i18n.translate('asCodeImport.importJson.cancelButton', {
      defaultMessage: 'Cancel',
    }),
  getImportingLabel: () =>
    i18n.translate('asCodeImport.importJson.importing', {
      defaultMessage: 'Importing…',
    }),
  getFilePickerLabel: () =>
    i18n.translate('asCodeImport.importJson.filePickerLabel', {
      defaultMessage: 'Select a JSON file',
    }),
  getInvalidJsonError: () =>
    i18n.translate('asCodeImport.importJson.invalidJsonError', {
      defaultMessage: 'The selected file does not contain valid JSON.',
    }),
  getFileTooLargeError: () =>
    i18n.translate('asCodeImport.importJson.fileTooLargeError', {
      defaultMessage: 'The selected file is too large. The maximum size is 25 MB.',
    }),
  getTechnicalPreviewBadgeLabel: () =>
    i18n.translate('asCodeImport.importJson.technicalPreviewBadgeLabel', {
      defaultMessage: 'TECHNICAL PREVIEW',
    }),
  getTechnicalPreviewBadgeTooltip: () =>
    i18n.translate('asCodeImport.importJson.technicalPreviewBadgeTooltip', {
      defaultMessage:
        'This functionality is experimental and not supported. It may change or be removed at any time.',
    }),
  getInfoCalloutTitle: (exportApplication: string) =>
    i18n.translate('asCodeImport.importJson.infoCalloutTitle', {
      defaultMessage: 'Only JSON files that are exported from {exportApplication} are supported.',
      values: { exportApplication },
    }),
  getNdjsonNoteLinkLabel: () =>
    i18n.translate('asCodeImport.importJson.ndjsonNoteLink', {
      defaultMessage: 'here',
    }),
  getWarningsTitle: () =>
    i18n.translate('asCodeImport.importJson.warningsTitle', {
      defaultMessage: 'Unsupported properties were removed',
    }),
  getWarningsSummary: (count: number) =>
    i18n.translate('asCodeImport.importJson.warningsSummary', {
      defaultMessage:
        '{count} item{count, plural, one {} other {s}} removed from the imported JSON.',
      values: { count },
    }),
  getWarningsAccordionShow: () =>
    i18n.translate('asCodeImport.importJson.warningsAccordionShow', {
      defaultMessage: 'Show details',
    }),
  getWarningsAccordionHide: () =>
    i18n.translate('asCodeImport.importJson.warningsAccordionHide', {
      defaultMessage: 'Hide details',
    }),
};
