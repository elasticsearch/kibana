/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export * from '../common/translations';

export const ERROR_TITLE = i18n.translate('xpack.cases.containers.errorTitle', {
  defaultMessage: 'Error fetching data',
});

export const ERROR_CREATING_CASE = i18n.translate('xpack.cases.containers.errorCreatingCaseTitle', {
  defaultMessage: 'Error creating case',
});

export const ERROR_DELETING = i18n.translate('xpack.cases.containers.errorDeletingTitle', {
  defaultMessage: 'Error deleting data',
});

export const ERROR_DELETING_FILE = i18n.translate('xpack.cases.containers.errorDeletingFile', {
  defaultMessage: 'Error deleting file',
});

export const ERROR_UPDATING = i18n.translate('xpack.cases.containers.errorUpdatingTitle', {
  defaultMessage: 'Error updating data',
});

export const UPDATED_CASE = (caseTitle: string) =>
  i18n.translate('xpack.cases.containers.updatedCase', {
    values: { caseTitle },
    defaultMessage: 'Updated "{caseTitle}"',
  });

export const UPDATED_CASES = i18n.translate('xpack.cases.containers.updatedCases', {
  defaultMessage: 'Updated cases',
});

export const SUCCESS_SEND_TO_EXTERNAL_SERVICE = (serviceName: string) =>
  i18n.translate('xpack.cases.containers.pushToExternalService', {
    values: { serviceName },
    defaultMessage: 'Successfully sent to { serviceName }',
  });

export const SYNC_CASE = (caseTitle: string) =>
  i18n.translate('xpack.cases.containers.syncCase', {
    values: { caseTitle },
    defaultMessage: 'Detections in "{caseTitle}" have been synced',
  });

export const EXTRACT_OBSERVABLES = (caseTitle: string) =>
  i18n.translate('xpack.cases.containers.extractObservables', {
    values: { caseTitle },
    defaultMessage: 'Auto-extract observables setting in "{caseTitle}" have been updated',
  });

export const STATUS_CHANGED_TOASTER_TEXT = i18n.translate(
  'xpack.cases.containers.statusChangeToasterText',
  {
    defaultMessage: 'Updated the statuses of attached alerts.',
  }
);

export const FILE_DELETE_SUCCESS = i18n.translate('xpack.cases.containers.deleteSuccess', {
  defaultMessage: 'File deleted successfully',
});

export const CATEGORIES_ERROR_TITLE = i18n.translate(
  'xpack.cases.containers.categoriesErrorTitle',
  {
    defaultMessage: 'Error fetching categories',
  }
);

export const OBSERVABLE_CREATED = i18n.translate('xpack.cases.caseView.observables.created', {
  defaultMessage: 'Observable created',
});

export const OBSERVABLE_REMOVED = i18n.translate('xpack.cases.caseView.observables.removed', {
  defaultMessage: 'Observable removed',
});

export const OBSERVABLE_UPDATED = i18n.translate('xpack.cases.caseView.observables.updated', {
  defaultMessage: 'Observable updated',
});

export const OBSERVABLE_BULK_CREATED = i18n.translate(
  'xpack.cases.caseView.observables.bulkCreated',
  {
    defaultMessage: 'Observables added',
  }
);

export const OBSERVABLE_MAX_REACHED = (maxObservables: number) =>
  i18n.translate('xpack.cases.caseView.observables.maxReached', {
    values: { maxObservables },
    defaultMessage:
      "You've reached the maximum number of observables {maxObservables} that can be added to a case. Some observables were not added.",
  });
