/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const RUN_WORKFLOW = i18n.translate('xpack.cases.workflows.runWorkflow', {
  defaultMessage: 'Run workflow',
});

export const SELECT_WORKFLOW_TITLE = i18n.translate('xpack.cases.workflows.selectWorkflowTitle', {
  defaultMessage: 'Select workflow',
});

export const WORKFLOW_ACTIVITY_FAILED = i18n.translate(
  'xpack.cases.workflows.activityFailedWarningMessage',
  {
    defaultMessage:
      'The workflow started, but the execution could not be added to the case activity.',
  }
);

export const RUN_WORKFLOW_STARTED = (count: number): string =>
  i18n.translate('xpack.cases.workflows.runWorkflowStarted', {
    defaultMessage: 'Started the workflow on {count, plural, one {# case} other {# cases}}',
    values: { count },
  });

export const VIEW_WORKFLOW_EXECUTION = i18n.translate(
  'xpack.cases.workflows.viewWorkflowExecution',
  {
    defaultMessage: 'View workflow execution',
  }
);
