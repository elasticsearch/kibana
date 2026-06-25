/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const PAGE_TITLE = i18n.translate('xpack.evals.datasetsList.pageTitle', {
  defaultMessage: 'Datasets',
});

export const CREATE_DATASET_BUTTON = i18n.translate(
  'xpack.evals.datasetsList.createDatasetButton',
  {
    defaultMessage: 'Create dataset',
  }
);

export const CREATE_DATASET_FLYOUT_TITLE = i18n.translate(
  'xpack.evals.datasetsList.createDatasetFlyout.title',
  {
    defaultMessage: 'Create dataset',
  }
);

export const CREATE_DATASET_NAME_LABEL = i18n.translate(
  'xpack.evals.datasetsList.createDatasetFlyout.nameLabel',
  {
    defaultMessage: 'Name',
  }
);

export const CREATE_DATASET_DESCRIPTION_LABEL = i18n.translate(
  'xpack.evals.datasetsList.createDatasetFlyout.descriptionLabel',
  {
    defaultMessage: 'Description',
  }
);

export const CREATE_DATASET_NAME_REQUIRED_ERROR = i18n.translate(
  'xpack.evals.datasetsList.createDatasetFlyout.nameRequiredError',
  {
    defaultMessage: 'Name is required.',
  }
);

export const CREATE_DATASET_CANCEL_BUTTON = i18n.translate(
  'xpack.evals.datasetsList.createDatasetFlyout.cancelButton',
  {
    defaultMessage: 'Cancel',
  }
);

export const CREATE_DATASET_SUBMIT_BUTTON = i18n.translate(
  'xpack.evals.datasetsList.createDatasetFlyout.submitButton',
  {
    defaultMessage: 'Create dataset',
  }
);

export const TABLE_CAPTION = i18n.translate('xpack.evals.datasetsList.tableCaption', {
  defaultMessage: 'Datasets',
});

export const COLUMN_NAME = i18n.translate('xpack.evals.datasetsList.columns.name', {
  defaultMessage: 'Name',
});

export const COLUMN_DESCRIPTION = i18n.translate('xpack.evals.datasetsList.columns.description', {
  defaultMessage: 'Description',
});

export const COLUMN_EXAMPLES = i18n.translate('xpack.evals.datasetsList.columns.examples', {
  defaultMessage: 'Examples',
});

export const COLUMN_LAST_UPDATED = i18n.translate('xpack.evals.datasetsList.columns.lastUpdated', {
  defaultMessage: 'Last Updated',
});

export const COLUMN_ACTIONS = i18n.translate('xpack.evals.datasetsList.columns.actions', {
  defaultMessage: 'Actions',
});

export const DELETE_DATASET_ACTION = i18n.translate(
  'xpack.evals.datasetsList.deleteDatasetAction',
  {
    defaultMessage: 'Delete dataset',
  }
);

export const getDeleteDatasetAriaLabel = (datasetName: string) =>
  i18n.translate('xpack.evals.datasetsList.deleteDatasetAriaLabel', {
    defaultMessage: 'Delete dataset {datasetName}',
    values: { datasetName },
  });

export const SEARCH_PLACEHOLDER = i18n.translate('xpack.evals.datasetsList.searchPlaceholder', {
  defaultMessage: 'Search datasets by name or description',
});

export const NO_DATASETS_TITLE = i18n.translate('xpack.evals.datasetsList.noDatasetsTitle', {
  defaultMessage: 'No datasets yet',
});

export const NO_DATASETS_BODY = i18n.translate('xpack.evals.datasetsList.noDatasetsBody', {
  defaultMessage: 'Create a dataset to start collecting examples for evaluations.',
});

export const NO_MATCHES_TITLE = i18n.translate('xpack.evals.datasetsList.noMatchesTitle', {
  defaultMessage: 'No matching datasets',
});

export const getNoMatchesBody = (searchTerm: string) =>
  i18n.translate('xpack.evals.datasetsList.noMatchesBody', {
    defaultMessage: 'No datasets match "{searchTerm}". Try a different search.',
    values: { searchTerm },
  });

export const CLEAR_SEARCH_BUTTON = i18n.translate('xpack.evals.datasetsList.clearSearchButton', {
  defaultMessage: 'Clear search',
});

export const LOAD_ERROR_TITLE = i18n.translate('xpack.evals.datasetsList.loadErrorTitle', {
  defaultMessage: 'Unable to load datasets',
});

export const getLoadErrorBody = (errorMessage: string) =>
  i18n.translate('xpack.evals.datasetsList.loadErrorBody', {
    defaultMessage: 'An error occurred while loading datasets: {errorMessage}',
    values: { errorMessage },
  });

export const RETRY_BUTTON = i18n.translate('xpack.evals.datasetsList.retryButton', {
  defaultMessage: 'Retry',
});
