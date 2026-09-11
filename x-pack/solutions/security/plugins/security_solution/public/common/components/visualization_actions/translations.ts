/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const MORE_ACTIONS = i18n.translate(
  'xpack.securitySolution.visualizationActions.moreActions',
  {
    defaultMessage: 'More actions',
  }
);

export const INSPECT = i18n.translate('xpack.securitySolution.visualizationActions.inspect', {
  defaultMessage: 'Inspect',
});

export const OPEN_IN_LENS = i18n.translate(
  'xpack.securitySolution.visualizationActions.openInLens',
  {
    defaultMessage: 'Open in Lens',
  }
);

export const ADD_TO_CASE_SUCCESS = i18n.translate(
  'xpack.securitySolution.visualizationActions.addToCaseSuccessContent',
  {
    defaultMessage: 'Successfully added visualization to the case',
  }
);

export const SOURCE_CHART_LABEL = i18n.translate(
  'xpack.securitySolution.visualizationActions.uniqueIps.sourceChartLabel',
  {
    defaultMessage: 'Src.',
  }
);

export const DESTINATION_CHART_LABEL = i18n.translate(
  'xpack.securitySolution.visualizationActions.uniqueIps.destinationChartLabel',
  {
    defaultMessage: 'Dest.',
  }
);

export const SUCCESS_CHART_LABEL = i18n.translate(
  'xpack.securitySolution.visualizationActions.userAuthentications.successChartLabel',
  {
    defaultMessage: 'Succ.',
  }
);

export const AUTHENTICATION_SUCCESS_CHART_LABEL = i18n.translate(
  'xpack.securitySolution.visualizationActions.userAuthentications.authentication.successChartLabel',
  {
    defaultMessage: 'Success',
  }
);

export const FAIL_CHART_LABEL = i18n.translate(
  'xpack.securitySolution.visualizationActions.userAuthentications.failChartLabel',
  {
    defaultMessage: 'Fail',
  }
);

export const AUTHENTICATION_FAILURE_CHART_LABEL = i18n.translate(
  'xpack.securitySolution.visualizationActions.userAuthentications.authentication.failureChartLabel',
  {
    defaultMessage: 'Failure',
  }
);

export const UNIQUE_COUNT = (field: string) =>
  i18n.translate('xpack.securitySolution.visualizationActions.uniqueCountLabel', {
    values: { field },

    defaultMessage: 'Unique count of {field}',
  });

export const TOP_VALUE = (field: string) =>
  i18n.translate('xpack.securitySolution.visualizationActions.topValueLabel', {
    values: { field },

    defaultMessage: 'Top values of {field}',
  });

export const COUNT = i18n.translate('xpack.securitySolution.visualizationActions.countLabel', {
  defaultMessage: 'Count of records',
});

export const COUNT_OF = (field: string) =>
  i18n.translate('xpack.securitySolution.visualizationActions.countOfFieldLabel', {
    values: { field },
    defaultMessage: 'Count of {field}',
  });

export const ADDED_TO_LIBRARY = i18n.translate(
  'xpack.securitySolution.visualizationActions.addedToLibrary',
  {
    defaultMessage: 'Added to library',
  }
);
