/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const BREADCRUMB_EVALUATIONS = i18n.translate(
  'xpack.evals.experimentDetail.breadcrumbEvaluations',
  { defaultMessage: 'Evaluations' }
);

export const STAT_TASK_MODEL = i18n.translate('xpack.evals.experimentDetail.stat.taskModel', {
  defaultMessage: 'Task Model',
});

export const STAT_EVALUATOR_MODEL = i18n.translate(
  'xpack.evals.experimentDetail.stat.evaluatorModel',
  {
    defaultMessage: 'Evaluator Model',
  }
);

export const STAT_REPETITIONS = i18n.translate('xpack.evals.experimentDetail.stat.repetitions', {
  defaultMessage: 'Repetitions',
});

export const STAT_BRANCH = i18n.translate('xpack.evals.experimentDetail.stat.branch', {
  defaultMessage: 'Branch',
});

export const STAT_CI = i18n.translate('xpack.evals.experimentDetail.stat.ci', {
  defaultMessage: 'CI',
});

export const STAT_PULL_REQUEST = i18n.translate('xpack.evals.experimentDetail.stat.pullRequest', {
  defaultMessage: 'PR',
});

export const CI_BUILD_LINK = i18n.translate('xpack.evals.experimentDetail.ciBuildLink', {
  defaultMessage: 'Build',
});

export const PR_LINK = i18n.translate('xpack.evals.experimentDetail.prLink', {
  defaultMessage: 'PR',
});

export const SECTION_DATASETS = i18n.translate('xpack.evals.experimentDetail.section.datasets', {
  defaultMessage: 'Datasets',
});

export const DELETED_DATASET_SUFFIX = i18n.translate(
  'xpack.evals.experimentDetail.deletedDatasetSuffix',
  {
    defaultMessage: '(deleted)',
  }
);

export const DELETED_DATASET_TOOLTIP = i18n.translate(
  'xpack.evals.experimentDetail.deletedDatasetTooltip',
  {
    defaultMessage:
      'This dataset has been deleted. Past results are preserved, but the dataset can no longer be opened.',
  }
);

export const SECTION_EVALUATOR_STATS = i18n.translate(
  'xpack.evals.experimentDetail.section.evaluatorStats',
  { defaultMessage: 'Evaluator Statistics' }
);

export const SECTION_EXAMPLE_SCORES = i18n.translate(
  'xpack.evals.experimentDetail.section.exampleScores',
  {
    defaultMessage: 'Example Scores',
  }
);

export const COLUMN_EVALUATOR = i18n.translate('xpack.evals.experimentDetail.columns.evaluator', {
  defaultMessage: 'Evaluator',
});

export const COLUMN_MEAN = i18n.translate('xpack.evals.experimentDetail.columns.mean', {
  defaultMessage: 'Mean',
});

export const COLUMN_MEDIAN = i18n.translate('xpack.evals.experimentDetail.columns.median', {
  defaultMessage: 'Median',
});

export const COLUMN_STD_DEV = i18n.translate('xpack.evals.experimentDetail.columns.stdDev', {
  defaultMessage: 'Std Dev',
});

export const COLUMN_MIN = i18n.translate('xpack.evals.experimentDetail.columns.min', {
  defaultMessage: 'Min',
});

export const COLUMN_MAX = i18n.translate('xpack.evals.experimentDetail.columns.max', {
  defaultMessage: 'Max',
});

export const getExampleCountLabel = (count: number) =>
  i18n.translate('xpack.evals.experimentDetail.exampleCountLabel', {
    defaultMessage: '{count, plural, one {# example} other {# examples}}',
    values: { count },
  });

export const getPageTitle = (experimentId: string) =>
  i18n.translate('xpack.evals.experimentDetail.pageTitle', {
    defaultMessage: 'Experiment: {experimentId}',
    values: { experimentId },
  });

export const getPageTitleWithName = (experimentName: string) =>
  i18n.translate('xpack.evals.experimentDetail.pageTitleWithName', {
    defaultMessage: 'Experiment: {experimentName}',
    values: { experimentName },
  });

export const getRunPageTitle = (suiteId: string) =>
  i18n.translate('xpack.evals.experimentDetail.runPageTitle', {
    defaultMessage: 'Suite: {suiteId}',
    values: { suiteId },
  });

export const getBreadcrumbExperiment = (experimentId: string) =>
  i18n.translate('xpack.evals.experimentDetail.breadcrumbExperiment', {
    defaultMessage: 'Experiment {experimentId}',
    values: { experimentId },
  });

export const getTraceFlyoutTitle = (traceId: string) =>
  i18n.translate('xpack.evals.experimentDetail.traceFlyoutTitle', {
    defaultMessage: 'Trace: {traceId}',
    values: { traceId },
  });

export const EXPERIMENT_NOT_FOUND_TITLE = i18n.translate(
  'xpack.evals.experimentDetail.experimentNotFoundTitle',
  {
    defaultMessage: 'Experiment not found',
  }
);

export const EXPERIMENT_LOAD_ERROR_TITLE = i18n.translate(
  'xpack.evals.experimentDetail.experimentLoadErrorTitle',
  {
    defaultMessage: 'Unable to load experiment',
  }
);

export const BACK_TO_EXPERIMENTS = i18n.translate(
  'xpack.evals.experimentDetail.backToExperiments',
  {
    defaultMessage: 'Back to Experiments',
  }
);

export const getExperimentNotFoundBody = (experimentId: string) =>
  i18n.translate('xpack.evals.experimentDetail.experimentNotFoundBody', {
    defaultMessage:
      'The experiment {experimentId} could not be found. It may have been deleted or the URL may be incorrect.',
    values: { experimentId },
  });

export const getExperimentLoadErrorBody = (errorMessage: string) =>
  i18n.translate('xpack.evals.experimentDetail.experimentLoadErrorBody', {
    defaultMessage: 'An error occurred while loading experiment details: {errorMessage}',
    values: { errorMessage },
  });

export const getExamplesLoadError = (errorMessage: string) =>
  i18n.translate('xpack.evals.experimentDetail.examplesLoadError', {
    defaultMessage: 'Failed to load dataset examples: {errorMessage}',
    values: { errorMessage },
  });
