/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const DELETE_EXCEPTION_ITEM_CONFIRMATION_TITLE = i18n.translate(
  'xpack.securitySolution.ruleExceptions.exceptionItemDeleteConfirmModal.title',
  {
    defaultMessage: 'Confirm deletion',
  }
);

export const DELETE_EXCEPTION_ITEM_CONFIRMATION_BODY = (exceptionItemName: string) =>
  i18n.translate('xpack.securitySolution.ruleExceptions.exceptionItemDeleteConfirmModal.body', {
    values: { exceptionItemName },
    defaultMessage:
      'This action will delete the exception "{exceptionItemName}". Click "Delete" to continue.',
  });

export const DELETE_EXCEPTION_ITEM_CONFIRMATION_CONFIRM = i18n.translate(
  'xpack.securitySolution.ruleExceptions.exceptionItemDeleteConfirmModal.confirm',
  {
    defaultMessage: 'Delete',
  }
);

export const DELETE_EXCEPTION_ITEM_CONFIRMATION_CANCEL = i18n.translate(
  'xpack.securitySolution.ruleExceptions.exceptionItemDeleteConfirmModal.cancel',
  {
    defaultMessage: 'Cancel',
  }
);
