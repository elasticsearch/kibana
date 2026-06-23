/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FilterControlConfig } from '@kbn/alerts-ui-shared/src/alert_filter_controls/types';
import { i18n } from '@kbn/i18n';

export const EXECUTION_FILTERS_URL_PARAM_KEY = 'workflowsExecutionsPageFilters' as const;
export const EXECUTION_FILTERS_STORAGE_KEY = 'workflows.executions.pageFilters' as const;

export const DEFAULT_EXECUTION_PAGE_FILTERS: FilterControlConfig[] = [
  {
    title: i18n.translate('workflowsManagement.executionsPage.filterStatus', {
      defaultMessage: 'Status',
    }),
    field_name: 'status',
    persist: true,
  },
  {
    title: i18n.translate('workflowsManagement.executionsPage.filterWorkflow', {
      defaultMessage: 'Workflow',
    }),
    field_name: 'workflowId',
    persist: true,
  },
  {
    title: i18n.translate('workflowsManagement.executionsPage.filterExecutedBy', {
      defaultMessage: 'Executed by',
    }),
    field_name: 'executedBy',
  },
  {
    title: i18n.translate('workflowsManagement.executionsPage.filterTrigger', {
      defaultMessage: 'Trigger',
    }),
    field_name: 'triggeredBy',
  },
];
